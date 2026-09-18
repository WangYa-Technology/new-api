package keyiyun

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	newapicommon "github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relay/channel"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBuildRequestBodyConvertsPublicVideoShape(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/video/generations", strings.NewReader(`{
		"model":"Wan3.0","prompt":"scene","images":["https://example.com/a.png"],
		"videos":["https://example.com/a.mp4"],"audios":["https://example.com/a.mp3"],
		"duration":"4","ratio":"9:16","resolution":"480P"
	}`))
	c.Request.Header.Set("Content-Type", "application/json")
	info := &relaycommon.RelayInfo{
		OriginModelName: "Wan3.0",
		ChannelMeta:     &relaycommon.ChannelMeta{},
	}
	adaptor := &TaskAdaptor{}

	require.Nil(t, adaptor.ValidateRequestAndSetAction(c, info))
	info.UpstreamModelName = "wan3.0-video-c1"
	body, err := adaptor.BuildRequestBody(c, info)
	require.NoError(t, err)
	data, err := io.ReadAll(body)
	require.NoError(t, err)
	var payload map[string]any
	require.NoError(t, newapicommon.Unmarshal(data, &payload))
	assert.Equal(t, "wan3.0-video-c1", payload["model"])
	assert.Equal(t, "9:16", payload["aspect_ratio"])
	assert.Len(t, payload["reference_images"], 1)
	assert.Len(t, payload["reference_videos"], 1)
	assert.Len(t, payload["reference_audios"], 1)
	assert.NotContains(t, payload, "images")
	assert.NotContains(t, payload, "ratio")
}

func TestParseTaskResultFailed(t *testing.T) {
	result, err := (&TaskAdaptor{}).ParseTaskResult([]byte(`{
		"id":"upstream-id","status":"failed","error":{"message":"content rejected"}
	}`))
	require.NoError(t, err)
	assert.Equal(t, "FAILURE", result.Status)
	assert.Equal(t, "content rejected", result.Reason)
}

func TestParseTaskResultAcceptsDecimalActualDuration(t *testing.T) {
	result, err := (&TaskAdaptor{}).ParseTaskResult([]byte(`{
		"id":"upstream-id","status":"completed","actualDuration":4.000000,
		"result_url":"https://example.com/video.mp4","amount":0.72
	}`))

	require.NoError(t, err)
	assert.Equal(t, "SUCCESS", result.Status)
	assert.Equal(t, "https://example.com/video.mp4", result.Url)
}

func TestBuildRequestURLNormalizesConfiguredTaskEndpoint(t *testing.T) {
	adaptor := &TaskAdaptor{}
	adaptor.Init(&relaycommon.RelayInfo{ChannelMeta: &relaycommon.ChannelMeta{
		ChannelBaseUrl: "https://example.com/kyyReactApiServer/v2/model-center/tasks/",
	}})
	requestURL, err := adaptor.BuildRequestURL(nil)
	require.NoError(t, err)
	assert.Equal(t, "https://example.com/kyyReactApiServer/v2/model-center/tasks", requestURL)
}

func TestAdjustBillingOnCompleteUsesActualDurationAndConfiguredPrice(t *testing.T) {
	task := &model.Task{PrivateData: model.TaskPrivateData{
		BillingContext: &model.TaskBillingContext{ModelPrice: 0.15, GroupRatio: 1.5},
	}}
	task.SetData(map[string]any{"actualDuration": 4.0, "amount": 999})
	taskResult := &relaycommon.TaskInfo{}

	quota := (&TaskAdaptor{}).AdjustBillingOnComplete(task, taskResult)
	expectedQuota, expectedClamp := newapicommon.QuotaFromFloatChecked(4 * 0.15 * newapicommon.QuotaPerUnit * 1.5)

	assert.Equal(t, expectedQuota, quota)
	assert.Equal(t, expectedClamp, taskResult.QuotaClamp)
}

func TestAdjustBillingOnCompleteRecordsSaturation(t *testing.T) {
	task := &model.Task{PrivateData: model.TaskPrivateData{
		BillingContext: &model.TaskBillingContext{ModelPrice: 1e308, GroupRatio: 1},
	}}
	task.SetData(map[string]any{"actualDuration": 3600})
	taskResult := &relaycommon.TaskInfo{}

	quota := (&TaskAdaptor{}).AdjustBillingOnComplete(task, taskResult)

	assert.Equal(t, newapicommon.MaxQuota, quota)
	require.NotNil(t, taskResult.QuotaClamp)
	assert.Equal(t, newapicommon.QuotaClampOverflow, taskResult.QuotaClamp.Kind)
}

func TestSupportsCompletionBillingAdjustment(t *testing.T) {
	var adaptor channel.TaskCompletionBillingAdaptor = &TaskAdaptor{}
	assert.True(t, adaptor.SupportsCompletionBillingAdjustment())
}
