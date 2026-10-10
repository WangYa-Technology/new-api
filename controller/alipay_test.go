package controller

import (
	"context"
	"crypto"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"fmt"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/wechatpay-apiv3/wechatpay-go/core"
	"github.com/wechatpay-apiv3/wechatpay-go/services/payments"
	"io"
	"math"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"gorm.io/gorm/schema"
)

func TestAlipayPaymentDatabaseMatrix(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	pub, err := x509.MarshalPKIXPublicKey(&key.PublicKey)
	require.NoError(t, err)
	config := model.AlipayConfig{AppID: "2026000000000001", SellerID: "2088000000000001", PrivateKey: string(pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)})), PublicKey: string(pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: pub})), Sandbox: true, UnitPrice: "7", MinTopUp: 1, PagePay: true, NotifyBaseURL: "http://localhost", ReturnURL: "http://localhost/wallet"}
	require.NoError(t, service.ValidateAlipayConfig(&config))
	for _, dialect := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(dialect, func(t *testing.T) {
			var driver gorm.Dialector
			switch dialect {
			case "sqlite":
				driver = sqlite.Open(":memory:")
			case "mysql":
				if os.Getenv("TEST_MYSQL_DSN") == "" {
					t.Skip("TEST_MYSQL_DSN not configured")
				}
				driver = mysql.Open(os.Getenv("TEST_MYSQL_DSN"))
			case "postgres":
				if os.Getenv("TEST_POSTGRES_DSN") == "" {
					t.Skip("TEST_POSTGRES_DSN not configured")
				}
				driver = postgres.Open(os.Getenv("TEST_POSTGRES_DSN"))
			}
			db, err := gorm.Open(driver, &gorm.Config{Logger: logger.Discard, NamingStrategy: schema.NamingStrategy{TablePrefix: "alipay_verify_"}})
			require.NoError(t, err)
			sqlDB, err := db.DB()
			require.NoError(t, err)
			sqlDB.SetMaxOpenConns(1)
			oldDB, oldLog, oldType, oldRedis := model.DB, model.LOG_DB, common.MainDatabaseType(), common.RedisEnabled
			model.DB = db
			model.LOG_DB = db
			common.RedisEnabled = false
			common.SetMainDatabaseType(common.DatabaseType(dialect))
			tables := []any{&model.WechatPayConfig{}, &model.WechatPayOrder{}, &model.AlipayOrder{}, &model.AlipayConfig{}, &model.TopUp{}, &model.User{}, &model.Log{}}
			t.Cleanup(func() {
				require.NoError(t, db.Migrator().DropTable(tables...))
				model.DB = oldDB
				model.LOG_DB = oldLog
				common.SetMainDatabaseType(oldType)
				common.RedisEnabled = oldRedis
				require.NoError(t, sqlDB.Close())
			})
			require.NoError(t, db.AutoMigrate(tables...))
			require.NoError(t, db.AutoMigrate(tables...))
			var version string
			query := "SELECT version()"
			if dialect == "sqlite" {
				query = "SELECT sqlite_version()"
			}
			require.NoError(t, db.Raw(query).Scan(&version).Error)
			t.Log(version)
			cfg := config
			cfg.ID = 0
			require.NoError(t, db.Create(&cfg).Error)
			user := model.User{Username: "alipay-test", Quota: 100, AuthVersion: 1}
			require.NoError(t, db.Create(&user).Error)
			topup := model.TopUp{UserId: user.Id, TradeNo: "ALIverified", PaymentProvider: model.PaymentProviderAlipay, PaymentMethod: model.PaymentMethodAlipayDirect, Status: common.TopUpStatusPending}
			order := model.AlipayOrder{TradeNo: topup.TradeNo, UserID: user.Id, ConfigID: cfg.ID, AmountFen: 700, CreditedQuota: 500000, Status: common.TopUpStatusPending}
			require.NoError(t, model.CreateAlipayOrder(&topup, &order))
			assert.Error(t, model.ManualCompleteTopUp(order.TradeNo, ""))
			values := url.Values{"app_id": {cfg.AppID}, "seller_id": {cfg.SellerID}, "out_trade_no": {order.TradeNo}, "trade_no": {"20261009000001"}, "trade_status": {"TRADE_SUCCESS"}, "total_amount": {"7.00"}, "sign_type": {"RSA2"}}
			sign := func(v url.Values) {
				keys := make([]string, 0, len(v))
				for k := range v {
					if k != "sign" && k != "sign_type" {
						keys = append(keys, k)
					}
				}
				sort.Strings(keys)
				parts := []string{}
				for _, k := range keys {
					parts = append(parts, k+"="+v.Get(k))
				}
				hash := sha256.Sum256([]byte(strings.Join(parts, "&")))
				sig, e := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, hash[:])
				require.NoError(t, e)
				v.Set("sign", base64.StdEncoding.EncodeToString(sig))
			}
			sign(values)
			notify := func(v url.Values) *httptest.ResponseRecorder {
				w := httptest.NewRecorder()
				c, _ := gin.CreateTestContext(w)
				c.Request = httptest.NewRequest("POST", "/api/user/alipay/notify", strings.NewReader(v.Encode()))
				c.Request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
				AlipayNotify(c)
				return w
			}
			for _, field := range []string{"app_id", "seller_id", "total_amount"} {
				v := url.Values{}
				for k, vs := range values {
					v[k] = append([]string{}, vs...)
				}
				v.Set(field, "9999999999999999")
				sign(v)
				assert.Equal(t, 400, notify(v).Code, field)
			}
			values.Add("total_amount", "7.00")
			assert.Equal(t, 400, notify(values).Code)
			values["total_amount"] = []string{"7.00"}
			values.Set("sign", "invalid")
			assert.Equal(t, 400, notify(values).Code)
			sign(values)
			for range 3 {
				w := notify(values)
				require.Equal(t, 200, w.Code, w.Body.String())
				assert.Equal(t, "success", w.Body.String())
			}
			require.NoError(t, db.First(&user, user.Id).Error)
			assert.Equal(t, 500100, user.Quota)
			assert.EqualValues(t, 500000, user.AlipayCredit)
			require.NoError(t, db.First(&order, order.ID).Error)
			assert.Equal(t, common.TopUpStatusSuccess, order.Status)
			assert.False(t, order.CachePending)
			assert.Error(t, model.RecordAlipayPayment(order.TradeNo, "different", 700))
			assert.Error(t, model.RecordAlipayPayment(order.TradeNo, *order.ProviderTradeNo, 701))

			// Paid evidence survives an overflow and the wallet transaction rolls back.
			overflowTopup := model.TopUp{UserId: user.Id, TradeNo: "ALIoverflow", PaymentProvider: model.PaymentProviderAlipay, Status: common.TopUpStatusPending}
			overflowOrder := model.AlipayOrder{TradeNo: overflowTopup.TradeNo, UserID: user.Id, ConfigID: cfg.ID, AmountFen: 700, CreditedQuota: int(common.MaxWalletQuota), Status: common.TopUpStatusPending}
			require.NoError(t, model.CreateAlipayOrder(&overflowTopup, &overflowOrder))
			require.NoError(t, model.RecordAlipayPayment(overflowOrder.TradeNo, "overflow-provider", 700))
			require.Error(t, model.CompleteAlipayTopUp(overflowOrder.TradeNo))
			require.NoError(t, db.First(&overflowOrder, overflowOrder.ID).Error)
			assert.Equal(t, "paid", overflowOrder.Status)
			require.NoError(t, db.First(&user, user.Id).Error)
			assert.Equal(t, 500100, user.Quota)
			// A provider transaction cannot fund a second merchant order.
			duplicateTopup := model.TopUp{UserId: user.Id, TradeNo: "ALIduplicate", PaymentProvider: model.PaymentProviderAlipay, Status: common.TopUpStatusPending}
			duplicateOrder := model.AlipayOrder{TradeNo: duplicateTopup.TradeNo, UserID: user.Id, ConfigID: cfg.ID, AmountFen: 700, CreditedQuota: 500, Status: common.TopUpStatusPending}
			require.NoError(t, model.CreateAlipayOrder(&duplicateTopup, &duplicateOrder))
			require.Error(t, model.RecordAlipayPayment(duplicateOrder.TradeNo, *order.ProviderTradeNo, 700))
			// An owner-only lookup never exposes another user's order.
			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)
			c.Set("id", user.Id+1)
			c.Params = gin.Params{{Key: "trade_no", Value: order.TradeNo}}
			GetAlipayOrderStatus(c)
			assert.Equal(t, 404, w.Code)
			// The unique predecessor prevents concurrent configuration revisions.
			next := cfg
			next.ID = 0
			next.PreviousID = cfg.ID
			require.NoError(t, db.Create(&next).Error)
			next.ID = 0
			assert.Error(t, db.Create(&next).Error)
			require.NoError(t, db.AutoMigrate(tables...))
			require.NoError(t, db.First(&user, user.Id).Error)
			assert.Equal(t, 500100, user.Quota)
			// Fractional USD credit remains exact in settlement and history.
			localUser := model.User{Username: "alipay-cny", AffCode: "alipay-cny", Quota: 0, AuthVersion: 1}
			require.NoError(t, db.Create(&localUser).Error)
			localTopup := model.TopUp{UserId: localUser.Id, Amount: 14, Money: 90, TradeNo: "ALI-cny", PaymentProvider: model.PaymentProviderAlipay, PaymentMethod: model.PaymentMethodAlipayDirect, Status: common.TopUpStatusPending}
			localOrder := model.AlipayOrder{TradeNo: localTopup.TradeNo, UserID: localUser.Id, ConfigID: cfg.ID, AmountFen: 9000, CreditedQuota: 7142857, Status: common.TopUpStatusPending}
			require.NoError(t, model.CreateAlipayOrder(&localTopup, &localOrder))
			require.NoError(t, model.RecordAlipayPayment(localOrder.TradeNo, "cny-provider", 9000))
			require.NoError(t, model.CompleteAlipayTopUp(localOrder.TradeNo))
			require.NoError(t, db.First(&localUser, localUser.Id).Error)
			assert.Equal(t, 7142857, localUser.Quota)
			require.NoError(t, model.PopulateAlipayTopUpQuotas([]*model.TopUp{&localTopup}))
			assert.Equal(t, 7142857, localTopup.CreditedQuota)
			wxPrivate, err := x509.MarshalPKCS8PrivateKey(key)
			require.NoError(t, err)
			wxConfig := model.WechatPayConfig{AppID: "wx1234567890abcdef", MchID: "1900000109", SerialNo: strings.Repeat("A", 40), PrivateKey: string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: wxPrivate})), APIv3Key: "abcdef0123456789abcdef0123456789", PublicKeyID: "PUB_KEY_ID_0123456789abcdef0123456789abcdef", PublicKey: config.PublicKey, NotifyBaseURL: "https://example.test", MinTopUp: 1}
			require.NoError(t, service.ValidateWechatPayConfig(&wxConfig))
			require.NoError(t, db.Create(&wxConfig).Error)
			wxTopup := model.TopUp{UserId: localUser.Id, Amount: 14, Money: 90, TradeNo: "WXverified", PaymentProvider: model.PaymentProviderWechatPay, PaymentMethod: model.PaymentMethodWechatPay, Status: common.TopUpStatusPending}
			wxOrder := model.WechatPayOrder{TradeNo: wxTopup.TradeNo, ConfigID: wxConfig.ID, UserID: localUser.Id, AmountFen: 9000, CreditedQuota: 7142857, Status: common.TopUpStatusPending}
			require.NoError(t, model.CreateWechatPayOrder(&wxTopup, &wxOrder))
			t.Run("Native SDK signed request and response", func(t *testing.T) {
				transport := http.DefaultTransport
				t.Cleanup(func() { http.DefaultTransport = transport })
				for _, valid := range []bool{true, false} {
					http.DefaultTransport = wechatFixtureTransport(func(req *http.Request) (*http.Response, error) {
						assert.Equal(t, "https://api.mch.weixin.qq.com/v3/pay/transactions/native", req.URL.String())
						body, err := io.ReadAll(req.Body)
						require.NoError(t, err)
						var request struct {
							AppID     string `json:"appid"`
							MchID     string `json:"mchid"`
							TradeNo   string `json:"out_trade_no"`
							NotifyURL string `json:"notify_url"`
							Amount    struct {
								Total    int64  `json:"total"`
								Currency string `json:"currency"`
							} `json:"amount"`
						}
						require.NoError(t, common.Unmarshal(body, &request))
						assert.Equal(t, wxConfig.AppID, request.AppID)
						assert.Equal(t, wxConfig.MchID, request.MchID)
						assert.Equal(t, wxOrder.TradeNo, request.TradeNo)
						assert.EqualValues(t, 9000, request.Amount.Total)
						assert.Equal(t, "CNY", request.Amount.Currency)
						assert.Equal(t, fmt.Sprintf("https://example.test/api/user/wechatpay/notify/%d", wxConfig.ID), request.NotifyURL)
						auth := map[string]string{}
						for _, match := range regexp.MustCompile(`([a-z_]+)="([^"]+)"`).FindAllStringSubmatch(req.Header.Get("Authorization"), -1) {
							auth[match[1]] = match[2]
						}
						digest := sha256.Sum256([]byte(fmt.Sprintf("POST\n/v3/pay/transactions/native\n%s\n%s\n%s\n", auth["timestamp"], auth["nonce_str"], body)))
						sig, err := base64.StdEncoding.DecodeString(auth["signature"])
						require.NoError(t, err)
						require.NoError(t, rsa.VerifyPKCS1v15(&key.PublicKey, crypto.SHA256, digest[:], sig))
						responseBody := `{"code_url":"weixin://wxpay/bizpayurl?pr=fixture"}`
						timestamp := strconv.FormatInt(time.Now().Unix(), 10)
						digest = sha256.Sum256([]byte(timestamp + "\nresponse-nonce\n" + responseBody + "\n"))
						sig, err = rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, digest[:])
						require.NoError(t, err)
						header := http.Header{}
						header.Set("Wechatpay-Serial", wxConfig.PublicKeyID)
						header.Set("Wechatpay-Timestamp", timestamp)
						header.Set("Wechatpay-Nonce", "response-nonce")
						header.Set("Wechatpay-Signature", base64.StdEncoding.EncodeToString(sig))
						if !valid {
							header.Set("Wechatpay-Signature", "invalid")
						}
						return &http.Response{StatusCode: 200, Header: header, Body: io.NopCloser(strings.NewReader(responseBody)), Request: req}, nil
					})
					link, err := service.CreateWechatPayCheckout(context.Background(), &wxConfig, &wxOrder)
					if valid {
						require.NoError(t, err)
						assert.Equal(t, "weixin://wxpay/bizpayurl?pr=fixture", link)
					} else {
						require.Error(t, err)
						assert.Empty(t, link)
					}
				}
			})

			require.Error(t, model.ManualCompleteTopUp(wxOrder.TradeNo, ""))
			require.Error(t, model.CompleteWechatPayTopUp(wxOrder.TradeNo))
			transaction := payments.Transaction{Appid: core.String(wxConfig.AppID), Mchid: core.String(wxConfig.MchID), OutTradeNo: core.String(wxOrder.TradeNo), TransactionId: core.String("420000000001"), TradeState: core.String("SUCCESS"), TradeType: core.String("NATIVE"), Amount: &payments.TransactionAmount{Total: core.Int64(9000), Currency: core.String("CNY")}}
			for _, testCase := range []struct {
				name   string
				mutate func(*payments.Transaction)
			}{
				{"wrong merchant", func(tx *payments.Transaction) { tx.Mchid = core.String("1900000110") }},
				{"wrong app", func(tx *payments.Transaction) { tx.Appid = core.String("wx0000000000000000") }},
				{"wrong amount", func(tx *payments.Transaction) {
					tx.Amount = &payments.TransactionAmount{Total: core.Int64(8999), Currency: core.String("CNY")}
				}},
				{"wrong currency", func(tx *payments.Transaction) {
					tx.Amount = &payments.TransactionAmount{Total: core.Int64(9000), Currency: core.String("USD")}
				}},
			} {
				t.Run(testCase.name, func(t *testing.T) {
					tx := transaction
					testCase.mutate(&tx)
					req := wechatNotifyFixture(t, key, wxConfig, &tx, time.Now().Unix())
					w := httptest.NewRecorder()
					c, _ := gin.CreateTestContext(w)
					c.Request = req
					c.Params = gin.Params{{Key: "config_id", Value: strconv.Itoa(wxConfig.ID)}}
					WechatPayNotify(c)
					c.Writer.WriteHeaderNow()
					assert.Equal(t, 400, w.Code)
				})
			}
			for _, bad := range []string{"signature", "expired", "serial", "nonce"} {
				req := wechatNotifyFixture(t, key, wxConfig, &transaction, time.Now().Unix())
				switch bad {
				case "signature":
					req.Header.Set("Wechatpay-Signature", "bad")
				case "expired":
					req = wechatNotifyFixture(t, key, wxConfig, &transaction, time.Now().Add(-10*time.Minute).Unix())
				case "serial":
					req.Header.Set("Wechatpay-Serial", "PUB_KEY_ID_wrong")
				case "nonce":
					req.Body = io.NopCloser(strings.NewReader(`{"resource":{"nonce":"bad"}}`))
				}
				_, err := service.VerifyWechatPayNotification(&wxConfig, req)
				require.Error(t, err, bad)
			}
			for range 2 {
				w := httptest.NewRecorder()
				c, _ := gin.CreateTestContext(w)
				c.Request = wechatNotifyFixture(t, key, wxConfig, &transaction, time.Now().Unix())
				c.Params = gin.Params{{Key: "config_id", Value: strconv.Itoa(wxConfig.ID)}}
				WechatPayNotify(c)
				c.Writer.WriteHeaderNow()
				assert.Equal(t, 204, w.Code)
			}
			require.NoError(t, db.First(&localUser, localUser.Id).Error)
			assert.Equal(t, 14285714, localUser.Quota)
			assert.EqualValues(t, 14285714, localUser.AlipayCredit)
			require.NoError(t, model.PopulateWechatPayTopUpQuotas([]*model.TopUp{&wxTopup}))
			assert.Equal(t, 7142857, wxTopup.CreditedQuota)
			require.Error(t, model.RecordWechatPayPayment(wxOrder.TradeNo, "different", 9000))
			require.Error(t, model.RecordWechatPayPayment(wxOrder.TradeNo, "420000000001", 1))
			overflowWX := model.TopUp{UserId: localUser.Id, TradeNo: "WXoverflow", PaymentProvider: model.PaymentProviderWechatPay, Status: common.TopUpStatusPending}
			overflowWXOrder := model.WechatPayOrder{TradeNo: overflowWX.TradeNo, ConfigID: wxConfig.ID, UserID: localUser.Id, AmountFen: 9000, CreditedQuota: int(common.MaxWalletQuota), Status: common.TopUpStatusPending}
			require.NoError(t, model.CreateWechatPayOrder(&overflowWX, &overflowWXOrder))
			require.Error(t, model.RecordWechatPayPayment(overflowWX.TradeNo, "420000000001", 9000))
			require.NoError(t, model.RecordWechatPayPayment(overflowWX.TradeNo, "420000000002", 9000))
			require.Error(t, model.CompleteWechatPayTopUp(overflowWX.TradeNo))
			require.NoError(t, db.First(&overflowWXOrder, overflowWXOrder.ID).Error)
			assert.Equal(t, "paid", overflowWXOrder.Status)
			require.NoError(t, db.First(&localUser, localUser.Id).Error)
			assert.Equal(t, 14285714, localUser.Quota)
			wrongKey := wxConfig
			wrongKey.APIv3Key = "0123456789abcdef0123456789abcdef"
			_, decryptErr := service.VerifyWechatPayNotification(&wrongKey, wechatNotifyFixture(t, key, wxConfig, &transaction, time.Now().Unix()))
			require.Error(t, decryptErr)

			w = httptest.NewRecorder()
			c, _ = gin.CreateTestContext(w)
			c.Set("id", localUser.Id+1)
			c.Params = gin.Params{{Key: "trade_no", Value: wxOrder.TradeNo}}
			GetWechatPayOrderStatus(c)
			assert.Equal(t, 404, w.Code)
			configJSON, err := common.Marshal(wxConfig)
			require.NoError(t, err)
			assert.NotContains(t, string(configJSON), wxConfig.APIv3Key)
			assert.NotContains(t, string(configJSON), "PRIVATE KEY")

		})
	}
}

func TestAlipayAmountValidation(t *testing.T) {
	for _, s := range []string{"0", "-1", "NaN", "1e8", "0.001", "100000000.01", "99999999999999"} {
		_, err := service.AlipayAmountFen(s)
		assert.Error(t, err, s)
	}
	fen, err := service.AlipayAmountFen("7.01")
	require.NoError(t, err)
	assert.EqualValues(t, 701, fen)
}

func TestAlipaySiteCurrencyQuote(t *testing.T) {
	general := operation_setting.GetGeneralSetting()
	payment := operation_setting.GetPaymentSetting()
	oldGeneral, oldPayment := *general, *payment
	oldRate, oldPrice, oldQuota := operation_setting.USDExchangeRate, operation_setting.Price, common.QuotaPerUnit
	t.Cleanup(func() {
		*general = oldGeneral
		*payment = oldPayment
		operation_setting.USDExchangeRate = oldRate
		operation_setting.Price = oldPrice
		common.QuotaPerUnit = oldQuota
	})
	operation_setting.USDExchangeRate = 7
	operation_setting.Price = 7
	common.QuotaPerUnit = 500000
	payment.AmountDiscount = map[int]float64{100: 0.9}
	config := &model.AlipayConfig{UnitPrice: "1", MinTopUp: 1}
	for _, tc := range []struct {
		name, mode  string
		amount, fen int64
		quota       int
	}{
		{"CNY discounted", "CNY", 100, 9000, 7142857},
		{"CNY small recharge", "CNY", 1, 100, 71429},
		{"USD discounted", "USD", 100, 63000, 50000000},
		{"custom currency", "CUSTOM", 100, 4500, 3571429},
	} {
		t.Run(tc.name, func(t *testing.T) {
			general.QuotaDisplayType = tc.mode
			general.CustomCurrencyExchangeRate = 14
			fen, quota, err := service.QuoteAlipay(config, tc.amount, "alipay-test")
			require.NoError(t, err)
			assert.Equal(t, tc.fen, fen)
			assert.Equal(t, tc.quota, quota)
		})
	}
	general.QuotaDisplayType = "CNY"
	for _, rate := range []float64{0, -1, math.NaN(), math.Inf(1)} {
		operation_setting.USDExchangeRate = rate
		_, _, err := service.QuoteAlipay(config, 100, "alipay-test")
		require.Error(t, err)
	}
}

// wechatNotifyFixture constructs authentic RSA/AES-GCM notification bytes for the SDK boundary.
func wechatNotifyFixture(t *testing.T, key *rsa.PrivateKey, config model.WechatPayConfig, tx *payments.Transaction, timestamp int64) *http.Request {
	t.Helper()
	plain, err := common.Marshal(tx)
	require.NoError(t, err)
	block, err := aes.NewCipher([]byte(config.APIv3Key))
	require.NoError(t, err)
	gcm, err := cipher.NewGCM(block)
	require.NoError(t, err)
	nonce := "nonce1234567"
	encrypted := gcm.Seal(nil, []byte(nonce), plain, []byte("transaction"))
	body, err := common.Marshal(map[string]any{"id": "notification-1", "event_type": "TRANSACTION.SUCCESS", "resource_type": "encrypt-resource", "resource": map[string]string{"algorithm": "AEAD_AES_256_GCM", "nonce": nonce, "associated_data": "transaction", "ciphertext": base64.StdEncoding.EncodeToString(encrypted)}})
	require.NoError(t, err)
	message := fmt.Sprintf("%d\nrequest-nonce\n%s\n", timestamp, body)
	hash := sha256.Sum256([]byte(message))
	signature, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, hash[:])
	require.NoError(t, err)
	req := httptest.NewRequest("POST", "/api/user/wechatpay/notify/1", strings.NewReader(string(body)))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Wechatpay-Serial", config.PublicKeyID)
	req.Header.Set("Wechatpay-Timestamp", strconv.FormatInt(timestamp, 10))
	req.Header.Set("Wechatpay-Nonce", "request-nonce")
	req.Header.Set("Wechatpay-Signature", base64.StdEncoding.EncodeToString(signature))
	return req
}

// wechatFixtureTransport replaces only the external HTTP boundary.
type wechatFixtureTransport func(*http.Request) (*http.Response, error)

func (f wechatFixtureTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
