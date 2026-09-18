package model

import (
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/setting/billing_setting"
	"github.com/QuantumNous/new-api/setting/config"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPricingExposesConfiguredPerSecondUnit(t *testing.T) {
	resetPricingEndpointTestTables(t)

	savedModelPrices := ratio_setting.ModelPrice2JSONString()
	savedBillingConfig := make(map[string]string)
	require.NoError(t, config.GlobalConfig.SaveToDB(func(key, value string) error {
		if strings.HasPrefix(key, "billing_setting.") {
			savedBillingConfig[key] = value
		}
		return nil
	}))
	t.Cleanup(func() {
		require.NoError(t, ratio_setting.UpdateModelPriceByJSONString(savedModelPrices))
		require.NoError(t, config.GlobalConfig.LoadFromDB(savedBillingConfig))
		InvalidatePricingCache()
	})

	prices, err := common.Marshal(map[string]float64{"per-second-video": 0.2})
	require.NoError(t, err)
	units, err := common.Marshal(map[string]string{"per-second-video": billing_setting.PriceUnitSecond})
	require.NoError(t, err)
	require.NoError(t, ratio_setting.UpdateModelPriceByJSONString(string(prices)))
	require.NoError(t, config.GlobalConfig.LoadFromDB(map[string]string{
		"billing_setting.price_unit": string(units),
	}))

	insertPricingEndpointChannel(t, 120, constant.ChannelTypeOpenAI, dto.ChannelOtherSettings{})
	insertPricingEndpointAbility(t, 120, "per-second-video")

	var found *Pricing
	for _, pricing := range GetPricing() {
		if pricing.ModelName == "per-second-video" {
			item := pricing
			found = &item
			break
		}
	}
	require.NotNil(t, found)
	assert.Equal(t, 1, found.QuotaType)
	assert.Equal(t, 0.2, found.ModelPrice)
	assert.Equal(t, billing_setting.PriceUnitSecond, found.BillingUnit)
}
