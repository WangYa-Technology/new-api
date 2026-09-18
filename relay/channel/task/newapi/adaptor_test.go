package newapi

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	newapicommon "github.com/QuantumNous/new-api/common"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBuildRequestBodyPreservesVideoFieldsAndMapsModel(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/video/generations", strings.NewReader(`{
		"model":"MiniMax-H3-Max（闭源）","prompt":"scene","images":[{"url":"https://example.com/a.png","role":"reference_image"}],
		"metadata":{"duration":6,"resolution":"768P","model":"bad-model"}
	}`))
	c.Request.Header.Set("Content-Type", "application/json")
	info := &relaycommon.RelayInfo{
		OriginModelName: "MiniMax-H3-Max（闭源）",
		ChannelMeta:     &relaycommon.ChannelMeta{},
	}
	adaptor := &TaskAdaptor{}

	require.Nil(t, adaptor.ValidateRequestAndSetAction(c, info))
	info.UpstreamModelName = "MiniMax-H3-Max"
	body, err := adaptor.BuildRequestBody(c, info)
	require.NoError(t, err)
	data, err := io.ReadAll(body)
	require.NoError(t, err)
	var payload map[string]any
	require.NoError(t, newapicommon.Unmarshal(data, &payload))
	assert.Equal(t, "MiniMax-H3-Max", payload["model"])
	assert.Equal(t, float64(6), payload["duration"])
	assert.Equal(t, "768P", payload["resolution"])
	assert.Len(t, payload["images"], 1)
	assert.NotContains(t, payload, "metadata")
	assert.InDelta(t, 6, adaptor.EstimateBilling(c, info)["seconds"], 0.000001)
}

func TestValidateRequestRejectsMetadataDurationOverflow(t *testing.T) {
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/video/generations", strings.NewReader(`{
		"model":"kling-v3","prompt":"scene","metadata":{"duration":3601}
	}`))
	c.Request.Header.Set("Content-Type", "application/json")

	taskErr := (&TaskAdaptor{}).ValidateRequestAndSetAction(c, &relaycommon.RelayInfo{})
	require.NotNil(t, taskErr)
	assert.Equal(t, http.StatusBadRequest, taskErr.StatusCode)
	assert.Equal(t, "invalid_seconds", taskErr.Code)
}

func TestParseTaskResultCompleted(t *testing.T) {
	result, err := (&TaskAdaptor{}).ParseTaskResult([]byte(`{
		"id":"upstream-id","status":"completed","data":[{"url":"https://example.com/video.mp4"}]
	}`))
	require.NoError(t, err)
	assert.Equal(t, "SUCCESS", result.Status)
	assert.Equal(t, "100%", result.Progress)
	assert.Equal(t, "https://example.com/video.mp4", result.Url)
}
