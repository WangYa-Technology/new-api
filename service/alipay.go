package service

import (
	"context"
	"errors"
	"fmt"
	"math"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/shopspring/decimal"
	"github.com/smartwalle/alipay/v3"
	"github.com/smartwalle/ncrypto"
)

var alipayIDPattern = regexp.MustCompile(`^[0-9]{16,32}$`)
var alipayPricePattern = regexp.MustCompile(`^[0-9]{1,7}(\.[0-9]{1,6})?$`)
var alipayAmountPattern = regexp.MustCompile(`^[0-9]{1,9}(\.[0-9]{1,2})?$`)

// AlipayAmountFen rejects exponent notation, fractions of a cent and oversized values.
func AlipayAmountFen(value string) (int64, error) {
	if !alipayAmountPattern.MatchString(value) {
		return 0, errors.New("invalid CNY amount")
	}
	amount, err := decimal.NewFromString(value)
	if err != nil || !amount.IsPositive() || amount.GreaterThan(decimal.NewFromInt(100000000)) {
		return 0, errors.New("invalid CNY amount")
	}
	return amount.Mul(decimal.NewFromInt(100)).IntPart(), nil
}

// AlipayClient pins the verifier to configured key material. Unknown certificate
// serial numbers cannot trigger certificate downloads from notification input.
func AlipayClient(config *model.AlipayConfig) (*alipay.Client, error) {
	key, err := ncrypto.DecodePrivateKey([]byte(config.PrivateKey)).PKCS1().RSAPrivateKey()
	if err != nil {
		key, err = ncrypto.DecodePrivateKey([]byte(config.PrivateKey)).PKCS8().RSAPrivateKey()
	}
	if err != nil || key == nil || key.N.BitLen() < 2048 {
		return nil, errors.New("应用私钥必须为至少 2048 位 RSA 私钥")
	}
	pub, err := ncrypto.DecodePublicKey([]byte(config.PublicKey)).PKIX().RSAPublicKey()
	if err != nil || pub == nil || pub.N.BitLen() < 2048 {
		return nil, errors.New("支付宝公钥必须为至少 2048 位 RSA 公钥")
	}
	client, err := alipay.New(config.AppID, config.PrivateKey, !config.Sandbox,
		alipay.WithTimeLocation(time.FixedZone("CST", 8*3600)),
		alipay.WithHTTPClient(&http.Client{Timeout: 15 * time.Second, CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }}))
	if err != nil {
		return nil, errors.New("支付宝配置无效")
	}
	if err := client.LoadAliPayPublicKey(config.PublicKey); err != nil {
		return nil, errors.New("支付宝公钥无效")
	}
	return client, nil
}

func ValidateAlipayConfig(config *model.AlipayConfig) error {
	if !alipayIDPattern.MatchString(config.AppID) || !alipayIDPattern.MatchString(config.SellerID) {
		return errors.New("应用 ID 或收款方 ID 无效")
	}
	if !alipayPricePattern.MatchString(config.UnitPrice) {
		return errors.New("人民币单价无效")
	}
	price, err := decimal.NewFromString(config.UnitPrice)
	if err != nil || !price.IsPositive() || price.GreaterThan(decimal.NewFromInt(1000000)) || price.Exponent() < -6 {
		return errors.New("人民币单价无效")
	}
	config.UnitPrice = price.String()
	if config.MinTopUp < 1 || config.MinTopUp > 1000000 {
		return errors.New("最低充值数量无效")
	}
	if !config.PagePay && !config.WapPay {
		return errors.New("请启用至少一种网站支付产品")
	}
	for _, raw := range []string{config.NotifyBaseURL, config.ReturnURL} {
		u, err := url.Parse(raw)
		if err != nil || u.Hostname() == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
			return errors.New("支付回调地址无效，请勿包含查询参数")
		}
		if u.Scheme != "https" && !(config.Sandbox && u.Scheme == "http") {
			return errors.New("正式环境支付回调必须使用 HTTPS")
		}
	}
	config.NotifyBaseURL = strings.TrimRight(config.NotifyBaseURL, "/")
	_, err = AlipayClient(config)
	return err
}

// QuoteAlipay converts site-currency input to wallet quota and payable CNY.
func QuoteAlipay(config *model.AlipayConfig, amount int64, group string) (int64, int, error) {
	return QuoteCNYTopUp(config.MinTopUp, amount, group)
}

// QuoteCNYTopUp is shared by direct CNY gateways with site-currency inputs.
func QuoteCNYTopUp(minTopUp int64, amount int64, group string) (int64, int, error) {
	if amount <= 0 || amount > common.MaxWalletQuota {
		return 0, 0, model.ErrInvalidTopUpQuota
	}
	units := decimal.NewFromInt(amount)
	if common.QuotaPerUnit <= 0 || math.IsNaN(common.QuotaPerUnit) || math.IsInf(common.QuotaPerUnit, 0) {
		return 0, 0, model.ErrInvalidTopUpQuota
	}
	quotaPerUnit := decimal.NewFromFloat(common.QuotaPerUnit)
	// Monetary input is denominated in the site's display currency. Quota
	// remains USD-based, and the frozen quota is the authority for settlement.
	minimumAmount := units
	switch operation_setting.GetQuotaDisplayType() {
	case operation_setting.QuotaDisplayTypeTokens:
		units = units.Div(quotaPerUnit).Floor()
		minimumAmount = units
	case operation_setting.QuotaDisplayTypeCNY, operation_setting.QuotaDisplayTypeCustom:
		rate := operation_setting.USDExchangeRate
		if operation_setting.GetQuotaDisplayType() == operation_setting.QuotaDisplayTypeCustom {
			rate = operation_setting.GetGeneralSetting().CustomCurrencyExchangeRate
		}
		if !(rate > 0 && rate <= 1000000) {
			return 0, 0, errors.New("站点汇率配置无效")
		}
		units = units.Div(decimal.NewFromFloat(rate))
	}
	if minimumAmount.LessThan(decimal.NewFromInt(minTopUp)) {
		return 0, 0, errors.New("充值数量低于最低充值数量")
	}
	quota, err := common.WalletQuotaFromDecimalStrict(units.Mul(quotaPerUnit))
	if err != nil || quota <= 0 {
		return 0, 0, model.ErrInvalidTopUpQuota
	}
	ratio := common.GetTopupGroupRatio(group)
	if ratio == 0 {
		ratio = 1
	}
	discount := 1.0
	if value, ok := operation_setting.GetPaymentSetting().AmountDiscount[int(amount)]; ok {
		discount = value
	}
	// Decimal constructors do not accept NaN/Inf.
	if !(ratio > 0 && ratio <= 1000000) || !(discount > 0 && discount <= 1) {
		return 0, 0, errors.New("充值倍率配置无效")
	}
	// The site's recharge price is shared with other CNY payment gateways.
	// Legacy per-provider prices must not silently decouple collection from credit.
	if !(operation_setting.Price > 0 && operation_setting.Price <= 1000000) {
		return 0, 0, errors.New("站点充值价格配置无效")
	}
	price := decimal.NewFromFloat(operation_setting.Price)
	money := units.Mul(price).Mul(decimal.NewFromFloat(ratio)).Mul(decimal.NewFromFloat(discount)).Round(2)
	fen, err := AlipayAmountFen(money.StringFixed(2))
	return fen, quota, err
}

// VerifyAlipayNotification performs local RSA2 verification only; configuration
// selection is restricted to the immutable revision of an existing order.
func VerifyAlipayNotification(config *model.AlipayConfig, values url.Values) (*alipay.Notification, error) {
	for _, vs := range values {
		if len(vs) != 1 {
			return nil, errors.New("duplicate notification field")
		}
	}
	if values.Get("sign_type") != "RSA2" || values.Get("alipay_cert_sn") != "" {
		return nil, errors.New("unsupported notification signature")
	}
	client, err := AlipayClient(config)
	if err != nil {
		return nil, err
	}
	notification, err := client.DecodeNotification(context.Background(), values)
	if err != nil {
		return nil, errors.New("invalid Alipay signature")
	}
	if notification.AppId != config.AppID || notification.SellerId != config.SellerID {
		return nil, errors.New("Alipay merchant mismatch")
	}
	return notification, nil
}

func ReconcileAlipayOrder(ctx context.Context, tradeNo string) error {
	order, config, err := model.GetAlipayOrder(tradeNo)
	if err != nil {
		return err
	}
	if order.Status == common.TopUpStatusSuccess {
		return model.SyncAlipayQuotaCache(order)
	}
	if order.Status == "paid" {
		return model.CompleteAlipayTopUp(tradeNo)
	}
	if order.Status != common.TopUpStatusPending {
		return nil
	}
	client, err := AlipayClient(config)
	if err != nil {
		return err
	}
	rsp, err := client.TradeQuery(ctx, alipay.TradeQuery{OutTradeNo: tradeNo})
	if err != nil {
		return errors.New("支付宝查单失败")
	}
	if rsp == nil {
		return errors.New("支付宝查单无响应")
	}
	if rsp.Code != alipay.CodeSuccess {
		// Page-pay requests can still be submitted after a local query. Do not
		// expire an unseen order before its absolute upstream expiry plus grace.
		if rsp.SubCode == "ACQ.TRADE_NOT_EXIST" && common.GetTimestamp() > order.ExpiresAt+24*3600 {
			return model.CloseAlipayOrder(tradeNo)
		}
		return errors.New("支付宝交易尚未确认")
	}
	if rsp.OutTradeNo != tradeNo {
		return errors.New("Alipay order mismatch")
	}
	fen, err := AlipayAmountFen(rsp.TotalAmount)
	if err != nil || fen != order.AmountFen {
		return errors.New("Alipay amount mismatch")
	}
	switch rsp.TradeStatus {
	case alipay.TradeStatusSuccess, alipay.TradeStatusFinished:
		if err := model.RecordAlipayPayment(tradeNo, rsp.TradeNo, fen); err != nil {
			return err
		}
		return model.CompleteAlipayTopUp(tradeNo)
	case alipay.TradeStatusClosed:
		return model.CloseAlipayOrder(tradeNo)
	case alipay.TradeStatusWaitBuyerPay:
		if common.GetTimestamp() <= order.ExpiresAt {
			return nil
		}
		closed, err := client.TradeClose(ctx, alipay.TradeClose{OutTradeNo: tradeNo})
		if err != nil || closed == nil || closed.Code != alipay.CodeSuccess {
			return errors.New("支付宝关单尚未确认")
		}
		return model.CloseAlipayOrder(tradeNo)
	}
	return errors.New("unknown Alipay trade status")
}

// RunAlipayReconciliation also drains committed cache credits after a crash.
// Database claims bound upstream calls across multiple application instances.
func RunAlipayReconciliation(ctx context.Context) error {
	var orders []model.AlipayOrder
	now := common.GetTimestamp()
	err := model.DB.Where("(status IN ? OR cache_pending = ?) AND next_check_at <= ?", []string{common.TopUpStatusPending, "paid"}, true, now).Order("next_check_at, id").Limit(30).Find(&orders).Error
	if err != nil {
		return errors.New("Alipay reconciliation database unavailable")
	}
	var failures []error
	for _, order := range orders {
		if err := ctx.Err(); err != nil {
			return err
		}
		claimed := model.DB.Model(&model.AlipayOrder{}).Where("id = ? AND next_check_at = ?", order.ID, order.NextCheckAt).Update("next_check_at", common.GetTimestamp()+300)
		if claimed.Error != nil {
			failures = append(failures, errors.New("Alipay claim failed"))
			continue
		}
		if claimed.RowsAffected != 1 {
			continue
		}
		if err := ReconcileAlipayOrder(ctx, order.TradeNo); err != nil {
			failures = append(failures, fmt.Errorf("Alipay order %s requires retry: %w", order.TradeNo, err))
		}
	}
	return errors.Join(failures...)
}
