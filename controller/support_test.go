package controller

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/console_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGetSupportLinksReturnsConfiguredCategories(t *testing.T) {
	settings := console_setting.GetConsoleSetting()
	previous := settings.SupportLinks
	settings.SupportLinks = `[{"id":"community","title":"Community","items":[]}]`
	t.Cleanup(func() { settings.SupportLinks = previous })

	response := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(response)
	context.Request = httptest.NewRequest(http.MethodGet, "/api/support", nil)

	GetSupportLinks(context)

	var payload struct {
		Success bool                     `json:"success"`
		Data    []map[string]interface{} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(response.Body.Bytes(), &payload))
	assert.True(t, payload.Success)
	require.Len(t, payload.Data, 1)
	assert.Equal(t, "community", payload.Data[0]["id"])
	assert.Equal(t, "Community", payload.Data[0]["title"])
}

func TestGetStatusReturnsConfiguredFooter(t *testing.T) {
	settings := console_setting.GetConsoleSetting()
	previousFooter := settings.Footer
	settings.Footer = `{"description":"Custom footer","socialLinks":[],"columns":[]}`
	t.Cleanup(func() { settings.Footer = previousFooter })

	previousMap := common.OptionMap
	common.OptionMap = map[string]string{}
	t.Cleanup(func() { common.OptionMap = previousMap })

	response := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(response)
	context.Request = httptest.NewRequest(http.MethodGet, "/api/status", nil)

	GetStatus(context)

	var payload struct {
		Success bool `json:"success"`
		Data    struct {
			Footer *console_setting.FooterConfig `json:"footer_config"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(response.Body.Bytes(), &payload))
	assert.True(t, payload.Success)
	require.NotNil(t, payload.Data.Footer)
	assert.Equal(t, "Custom footer", payload.Data.Footer.Description)
}
