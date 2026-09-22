package siliconflow

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBuildSubmitRequest(t *testing.T) {
	seed := int64(0)
	payload, err := buildSubmitRequest(relaycommon.TaskSubmitReq{
		Prompt: "Animate the frame",
		Images: []string{"https://example.com/frame.png"},
		Size:   "720x1280",
		Metadata: map[string]any{
			"negative_prompt": "blur",
			"seed":            seed,
		},
	}, ModelWan22I2V)
	require.NoError(t, err)
	assert.Equal(t, ModelWan22I2V, payload.Model)
	assert.Equal(t, "https://example.com/frame.png", payload.Image)
	assert.Equal(t, "720x1280", payload.ImageSize)
	assert.Equal(t, "blur", payload.NegativePrompt)
	require.NotNil(t, payload.Seed)
	assert.Equal(t, seed, *payload.Seed)
}

func TestBuildSubmitRequestValidation(t *testing.T) {
	tests := []struct {
		name    string
		model   string
		request relaycommon.TaskSubmitReq
		message string
	}{
		{name: "image required", model: ModelWan22I2V, request: relaycommon.TaskSubmitReq{}, message: "requires an input image"},
		{name: "text rejects image", model: ModelWan22T2V, request: relaycommon.TaskSubmitReq{Images: []string{"https://example.com/frame.png"}}, message: "does not accept an input image"},
		{name: "invalid size", model: ModelWan22T2V, request: relaycommon.TaskSubmitReq{Size: "1024x1024"}, message: "unsupported image_size"},
		{name: "invalid model", model: "other", request: relaycommon.TaskSubmitReq{}, message: "unsupported SiliconFlow video model"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, err := buildSubmitRequest(test.request, test.model)
			require.Error(t, err)
			assert.Contains(t, err.Error(), test.message)
		})
	}
}

func TestRequestURLsAcceptVersionedBaseURL(t *testing.T) {
	adaptor := &TaskAdaptor{baseURL: "https://api.siliconflow.cn/v1"}
	url, err := adaptor.BuildRequestURL(&relaycommon.RelayInfo{})
	require.NoError(t, err)
	assert.Equal(t, "https://api.siliconflow.cn/v1/video/submit", url)
}

func TestFetchTask(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPost, r.Method)
		assert.Equal(t, "/v1/video/status", r.URL.Path)
		assert.Equal(t, "Bearer test-key", r.Header.Get("Authorization"))
		var body map[string]string
		require.NoError(t, common.DecodeJson(r.Body, &body))
		assert.Equal(t, "upstream-id", body["requestId"])
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"InQueue"}`))
	}))
	defer server.Close()

	resp, err := (&TaskAdaptor{}).FetchTask(server.URL+"/v1", "test-key", &model.Task{TaskID: "upstream-id"}, "")
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestParseTaskResult(t *testing.T) {
	tests := []struct {
		name     string
		body     string
		status   model.TaskStatus
		progress string
		url      string
		reason   string
	}{
		{name: "queued", body: `{"status":"InQueue"}`, status: model.TaskStatusQueued, progress: "20%"},
		{name: "running", body: `{"status":"InProgress"}`, status: model.TaskStatusInProgress, progress: "30%"},
		{name: "success", body: `{"status":"Succeed","results":{"videos":[{"url":"https://example.com/video.mp4"}]}}`, status: model.TaskStatusSuccess, progress: "100%", url: "https://example.com/video.mp4"},
		{name: "failed", body: `{"status":"Failed","reason":"rejected"}`, status: model.TaskStatusFailure, progress: "100%", reason: "rejected"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			result, err := (&TaskAdaptor{}).ParseTaskResult(nil, nil, []byte(test.body))
			require.NoError(t, err)
			assert.Equal(t, string(test.status), result.Status)
			assert.Equal(t, test.progress, result.Progress)
			assert.Equal(t, test.url, result.Url)
			assert.Equal(t, test.reason, result.Reason)
		})
	}
}

func TestDoResponseReturnsPublicTaskID(t *testing.T) {
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	resp := &http.Response{
		StatusCode: http.StatusOK,
		Body:       io.NopCloser(bytes.NewBufferString(`{"requestId":"upstream-id"}`)),
	}
	info := &relaycommon.RelayInfo{TaskRelayInfo: &relaycommon.TaskRelayInfo{}}
	info.PublicTaskID = "task_public"
	info.OriginModelName = ModelWan22T2V

	taskID, data, taskErr := (&TaskAdaptor{}).DoResponse(c, resp, info)
	require.Nil(t, taskErr)
	assert.Equal(t, "upstream-id", taskID)
	assert.JSONEq(t, `{"requestId":"upstream-id"}`, string(data))
}
