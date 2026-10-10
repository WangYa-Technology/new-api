package controller

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"
	"github.com/smartwalle/alipay/v3"
	"github.com/thanhpk/randstr"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func GetAlipayConfig(c *gin.Context) {
	config, err := model.CurrentAlipayConfig()
	if err != nil {
		common.ApiErrorMsg(c, "无法读取支付宝配置")
		return
	}
	common.ApiSuccess(c, gin.H{"config": config, "has_private_key": config.PrivateKey != ""})
}

func SaveAlipayConfig(c *gin.Context) {
	if c.GetBool("use_access_token") {
		c.AbortWithStatus(http.StatusForbidden)
		return
	}
	if c.ContentType() != "application/json" {
		c.AbortWithStatus(http.StatusUnsupportedMediaType)
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(c.Writer, c.Request.Body, 32768))
	if err != nil {
		common.ApiErrorMsg(c, "配置过大")
		return
	}
	var req struct {
		model.AlipayConfig
		PrivateKey string `json:"private_key"`
	}
	if common.Unmarshal(body, &req) != nil {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	current, err := model.CurrentAlipayConfig()
	if err != nil {
		common.ApiErrorMsg(c, "无法读取支付宝配置")
		return
	}
	if current.ID != req.ID {
		common.ApiErrorMsg(c, "支付宝配置已变更，请刷新后重试")
		return
	}
	req.AlipayConfig.PrivateKey = req.PrivateKey
	if req.PrivateKey == "" && req.AppID == current.AppID && req.Sandbox == current.Sandbox {
		req.AlipayConfig.PrivateKey = current.PrivateKey
	}
	if err := service.ValidateAlipayConfig(&req.AlipayConfig); err != nil {
		common.ApiError(c, err)
		return
	}
	if req.Enabled && !requirePaymentCompliance(c) {
		return
	}
	hash := sha256.Sum256(body)
	proofContext, _ := common.Marshal(map[string]string{"config_hash": hex.EncodeToString(hash[:])})
	if middleware.RequireSecurityProof(c, service.VerificationOperation{Scope: service.VerificationScopeAlipayConfig, Context: proofContext}) == nil {
		return
	}
	req.PreviousID = current.ID
	req.ID = 0
	req.CreatedAt = common.GetTimestamp()
	if err := model.DB.Session(&gorm.Session{Logger: logger.Discard}).Create(&req.AlipayConfig).Error; err != nil {
		common.ApiErrorMsg(c, "保存支付宝配置失败")
		return
	}
	common.ApiSuccess(c, gin.H{"config": req.AlipayConfig, "has_private_key": true})
}

func AlipayQuote(c *gin.Context) {
	var req AmountRequest
	if c.ContentType() != "application/json" || c.ShouldBindJSON(&req) != nil {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	config, err := model.CurrentAlipayConfig()
	if err != nil || !config.Enabled || !operation_setting.IsPaymentComplianceConfirmed() {
		common.ApiErrorMsg(c, "支付宝支付未启用")
		return
	}
	group, err := model.GetUserGroup(c.GetInt("id"), true)
	if err != nil {
		common.ApiErrorMsg(c, "获取用户分组失败")
		return
	}
	fen, quota, err := service.QuoteAlipay(config, req.Amount, group)
	if err == nil {
		err = model.ValidateTopUpQuotaCapacity(c.GetInt("id"), quota)
	}
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "success", "data": decimal.NewFromInt(fen).Div(decimal.NewFromInt(100)).StringFixed(2)})
}

func RequestAlipayPay(c *gin.Context) {
	var req struct {
		Amount         int64  `json:"amount"`
		Mobile         bool   `json:"mobile"`
		ExpectedAmount string `json:"expected_amount"`
	}
	if c.ContentType() != "application/json" || c.ShouldBindJSON(&req) != nil {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	config, err := model.CurrentAlipayConfig()
	if err != nil || !config.Enabled || !operation_setting.IsPaymentComplianceConfirmed() {
		common.ApiErrorMsg(c, "支付宝支付未启用")
		return
	}
	userID := c.GetInt("id")
	group, err := model.GetUserGroup(userID, true)
	if err != nil {
		common.ApiErrorMsg(c, "获取用户分组失败")
		return
	}
	fen, quota, err := service.QuoteAlipay(config, req.Amount, group)
	if err == nil {
		err = model.ValidateTopUpQuotaCapacity(userID, quota)
	}
	if err != nil {
		common.ApiError(c, err)
		return
	}
	expected, err := service.AlipayAmountFen(req.ExpectedAmount)
	if err != nil || expected != fen {
		common.ApiErrorMsg(c, "支付金额已变化，请重新确认")
		return
	}
	client, err := service.AlipayClient(config)
	if err != nil {
		common.ApiErrorMsg(c, "支付宝配置无效")
		return
	}
	tradeNo := "ALI" + randstr.Hex(16)
	now := common.GetTimestamp()
	money := decimal.NewFromInt(fen).Div(decimal.NewFromInt(100))
	order := model.AlipayOrder{TradeNo: tradeNo, ConfigID: config.ID, UserID: userID, AmountFen: fen, CreditedQuota: quota, Status: common.TopUpStatusPending, ExpiresAt: now + 1800, NextCheckAt: now + 60}
	trade := alipay.Trade{OutTradeNo: tradeNo, Subject: "账户充值", TotalAmount: money.StringFixed(2), SellerId: config.SellerID, NotifyURL: config.NotifyBaseURL + "/api/user/alipay/notify", ReturnURL: config.ReturnURL, TimeExpire: time.Unix(order.ExpiresAt, 0).In(time.FixedZone("CST", 8*3600)).Format("2006-01-02 15:04:05")}
	var payURL string
	if (req.Mobile && config.WapPay) || !config.PagePay {
		trade.ProductCode = "QUICK_WAP_WAY"
		u, e := client.TradeWapPay(alipay.TradeWapPay{Trade: trade, TimeExpire: trade.TimeExpire})
		err = e
		if u != nil {
			payURL = u.String()
		}
	} else {
		trade.ProductCode = "FAST_INSTANT_TRADE_PAY"
		u, e := client.TradePagePay(alipay.TradePagePay{Trade: trade})
		err = e
		if u != nil {
			payURL = u.String()
		}
	}
	if err != nil || payURL == "" {
		common.ApiErrorMsg(c, "创建支付宝支付链接失败")
		return
	}
	units := decimal.NewFromInt(int64(quota)).Div(decimal.NewFromFloat(common.QuotaPerUnit)).IntPart()
	topup := model.TopUp{UserId: userID, Amount: units, Money: money.InexactFloat64(), TradeNo: tradeNo, PaymentMethod: model.PaymentMethodAlipayDirect, PaymentProvider: model.PaymentProviderAlipay, CreateTime: now, Status: common.TopUpStatusPending}
	if err := model.CreateAlipayOrder(&topup, &order); err != nil {
		common.ApiErrorMsg(c, "创建订单失败")
		return
	}
	common.ApiSuccess(c, gin.H{"pay_link": payURL, "trade_no": tradeNo, "amount": money.StringFixed(2), "currency": "CNY"})
}

func AlipayNotify(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 64*1024)
	if c.ContentType() != "application/x-www-form-urlencoded" || c.Request.ParseForm() != nil {
		c.String(http.StatusBadRequest, "fail")
		return
	}
	values := c.Request.PostForm
	tradeNo := values.Get("out_trade_no")
	if len(tradeNo) > 64 || tradeNo == "" {
		c.String(http.StatusBadRequest, "fail")
		return
	}
	order, config, err := model.GetAlipayOrder(tradeNo)
	if err != nil {
		c.String(http.StatusBadRequest, "fail")
		return
	}
	notification, err := service.VerifyAlipayNotification(config, values)
	if err != nil {
		c.String(http.StatusBadRequest, "fail")
		return
	}
	fen, err := service.AlipayAmountFen(notification.TotalAmount)
	if err != nil || fen != order.AmountFen {
		c.String(http.StatusBadRequest, "fail")
		return
	}
	switch notification.TradeStatus {
	case alipay.TradeStatusSuccess, alipay.TradeStatusFinished:
		err = model.RecordAlipayPayment(tradeNo, notification.TradeNo, fen)
		if err == nil {
			err = model.CompleteAlipayTopUp(tradeNo)
		}
	case alipay.TradeStatusClosed:
		// Query before closing: a delayed full-refund notification must never
		// overwrite a paid order or silently deduct a user's wallet balance.
		err = service.ReconcileAlipayOrder(c.Request.Context(), tradeNo)
	case alipay.TradeStatusWaitBuyerPay:
	default:
		err = errors.New("unknown trade status")
	}
	if err != nil {
		common.SysError(fmt.Sprintf("Alipay notification order %s requires retry", tradeNo))
		c.String(http.StatusInternalServerError, "fail")
		return
	}
	alipay.ACKNotification(c.Writer)
}

func GetAlipayOrderStatus(c *gin.Context) {
	order, _, err := model.GetAlipayOrder(c.Param("trade_no"))
	if err != nil || order.UserID != c.GetInt("id") {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	common.ApiSuccess(c, order)
}

func RecheckAlipayOrder(c *gin.Context) {
	if c.ContentType() != "application/json" {
		c.AbortWithStatus(http.StatusUnsupportedMediaType)
		return
	}
	var req struct {
		TradeNo string `json:"trade_no"`
	}
	if c.ShouldBindJSON(&req) != nil {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	if err := service.ReconcileAlipayOrder(c.Request.Context(), req.TradeNo); err != nil {
		common.ApiErrorMsg(c, "支付宝订单尚未完成，请稍后重试")
		return
	}
	common.ApiSuccess(c, nil)
}

func alipayMinimum(config *model.AlipayConfig) string {
	minimum := decimal.NewFromInt(config.MinTopUp)
	if operation_setting.GetQuotaDisplayType() == operation_setting.QuotaDisplayTypeTokens {
		minimum = minimum.Mul(decimal.NewFromFloat(common.QuotaPerUnit))
	}
	return strconv.FormatInt(minimum.IntPart(), 10)
}
