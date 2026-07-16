package jiekou

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBuildSubmitRequest(t *testing.T) {
	tests := []struct {
		name      string
		model     string
		request   relaycommon.TaskSubmitReq
		assertion func(*testing.T, *submitRequest)
	}{
		{
			name:    "seedance 2 fast defaults",
			model:   ModelSeedance20Fast,
			request: relaycommon.TaskSubmitReq{Prompt: "A red dot moves right"},
			assertion: func(t *testing.T, request *submitRequest) {
				require.NotNil(t, request.Fast)
				assert.True(t, *request.Fast)
				assert.Equal(t, defaultDuration, request.Duration)
				assert.Equal(t, defaultResolution, request.Resolution)
				assert.Equal(t, defaultAdaptiveRatio, request.Ratio)
				assert.Empty(t, request.AspectRatio)
			},
		},
		{
			name:  "seedance 1.5 image request",
			model: ModelSeedance15ProI2V,
			request: relaycommon.TaskSubmitReq{
				Prompt:   "Animate the reference",
				Images:   []string{"https://example.com/frame.png"},
				Size:     "720x1280",
				Duration: 6,
				Metadata: map[string]any{
					"service_tier":   "flex",
					"generate_audio": true,
				},
			},
			assertion: func(t *testing.T, request *submitRequest) {
				assert.Equal(t, "https://example.com/frame.png", request.Image)
				assert.Equal(t, "9:16", request.Ratio)
				assert.Equal(t, "flex", request.ServiceTier)
				require.NotNil(t, request.GenerateAudio)
				assert.True(t, *request.GenerateAudio)
			},
		},
		{
			name:  "v1 pro uses aspect ratio",
			model: ModelSeedanceV1ProT2V,
			request: relaycommon.TaskSubmitReq{
				Prompt:   "A city at sunrise",
				Size:     "1920x1080",
				Duration: 10,
				Metadata: map[string]any{"ratio": "1:1"},
			},
			assertion: func(t *testing.T, request *submitRequest) {
				assert.Equal(t, "1080p", request.Resolution)
				assert.Equal(t, "16:9", request.AspectRatio)
				assert.Empty(t, request.Ratio)
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request, err := buildSubmitRequest(&test.request, test.model)
			require.NoError(t, err)
			test.assertion(t, request)
		})
	}
}

func TestBuildSubmitRequestRejectsInvalidModelParameters(t *testing.T) {
	tests := []struct {
		name    string
		model   string
		request relaycommon.TaskSubmitReq
		message string
	}{
		{
			name:    "image model requires image",
			model:   ModelSeedanceV1LiteI2V,
			request: relaycommon.TaskSubmitReq{Prompt: "Animate this", Duration: 5},
			message: "requires an input image",
		},
		{
			name:    "text model rejects image",
			model:   ModelSeedanceV1ProT2V,
			request: relaycommon.TaskSubmitReq{Prompt: "Create a video", Images: []string{"https://example.com/frame.png"}, Duration: 5},
			message: "does not accept an input image",
		},
		{
			name:    "fast model rejects 1080p",
			model:   ModelSeedance20Fast,
			request: relaycommon.TaskSubmitReq{Prompt: "Create a video", Size: "1080p", Duration: 5},
			message: "does not support resolution",
		},
		{
			name:    "v1 model rejects unsupported duration",
			model:   ModelSeedanceV1LiteT2V,
			request: relaycommon.TaskSubmitReq{Prompt: "Create a video", Duration: 6},
			message: "supports duration 5 or 10 seconds",
		},
		{
			name:    "seedance 2 rejects service tier",
			model:   ModelSeedance20,
			request: relaycommon.TaskSubmitReq{Prompt: "Create a video", Duration: 5, Metadata: map[string]any{"service_tier": "flex"}},
			message: "does not support service_tier",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, err := buildSubmitRequest(&test.request, test.model)
			require.Error(t, err)
			assert.Contains(t, err.Error(), test.message)
		})
	}
}

func TestTaskAdaptorEstimateBilling(t *testing.T) {
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Set("task_request", relaycommon.TaskSubmitReq{
		Prompt:   "Create a cinematic video",
		Size:     "1080p",
		Duration: 10,
	})
	info := &relaycommon.RelayInfo{
		OriginModelName: ModelSeedance20,
		ChannelMeta:     &relaycommon.ChannelMeta{UpstreamModelName: ModelSeedance20},
	}

	ratios := (&TaskAdaptor{}).EstimateBilling(c, info)

	assert.Equal(t, 10.0, ratios["seconds"])
	assert.Equal(t, 2.5, ratios["resolution"])
	assert.NotContains(t, ratios, "service_tier")

	c.Set("task_request", relaycommon.TaskSubmitReq{
		Prompt:   "Animate the image",
		Images:   []string{"https://example.com/frame.png"},
		Size:     "720p",
		Duration: 10,
		Metadata: map[string]any{"service_tier": "flex"},
	})
	info.OriginModelName = ModelSeedance15ProI2V
	info.UpstreamModelName = ModelSeedance15ProI2V
	ratios = (&TaskAdaptor{}).EstimateBilling(c, info)
	assert.Equal(t, 0.5, ratios["service_tier"])
}

func TestTaskAdaptorBuildRequestURL(t *testing.T) {
	adaptor := &TaskAdaptor{}
	adaptor.Init(&relaycommon.RelayInfo{ChannelMeta: &relaycommon.ChannelMeta{ChannelBaseUrl: "https://api.highwayapi.ai/openai/"}})

	requestURL, err := adaptor.BuildRequestURL(&relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{UpstreamModelName: ModelSeedance20Fast},
	})

	require.NoError(t, err)
	assert.Equal(t, "https://api.highwayapi.ai/v3/async/seedance-2.0", requestURL)
}

func TestTaskAdaptorDoResponse(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	response := &http.Response{
		StatusCode: http.StatusOK,
		Body:       io.NopCloser(strings.NewReader(`{"task_id":"upstream-task"}`)),
	}
	info := &relaycommon.RelayInfo{
		OriginModelName: ModelSeedance20,
		TaskRelayInfo: &relaycommon.TaskRelayInfo{
			PublicTaskID: "task_public",
		},
	}

	taskID, body, taskErr := (&TaskAdaptor{}).DoResponse(c, response, info)

	require.Nil(t, taskErr)
	assert.Equal(t, "upstream-task", taskID)
	assert.JSONEq(t, `{"task_id":"upstream-task"}`, string(body))
	assert.Equal(t, http.StatusOK, recorder.Code)
	assert.Contains(t, recorder.Body.String(), "task_public")
}

func TestTaskAdaptorFetchTask(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodGet, r.Method)
		assert.Equal(t, "/v3/async/task-result", r.URL.Path)
		assert.Equal(t, "upstream task", r.URL.Query().Get("task_id"))
		assert.Equal(t, "Bearer secret", r.Header.Get("Authorization"))
		_, _ = w.Write([]byte(`{"task":{"task_id":"upstream task","status":"TASK_STATUS_RUNNING"}}`))
	}))
	defer server.Close()

	response, err := (&TaskAdaptor{}).FetchTask(server.URL, "secret", map[string]any{"task_id": "upstream task"}, "")

	require.NoError(t, err)
	require.NotNil(t, response)
	_ = response.Body.Close()
}

func TestTaskAdaptorParseTaskResult(t *testing.T) {
	tests := []struct {
		name       string
		body       string
		status     model.TaskStatus
		progress   string
		url        string
		reason     string
		shouldFail bool
	}{
		{
			name:     "success",
			body:     `{"task":{"task_id":"upstream","status":"TASK_STATUS_SUCCEED"},"videos":[{"video_url":"https://example.com/video.mp4"}]}`,
			status:   model.TaskStatusSuccess,
			progress: "100%",
			url:      "https://example.com/video.mp4",
		},
		{
			name:     "nested processing response",
			body:     `{"data":{"task":{"task_id":"upstream","status":"TASK_STATUS_RUNNING","progress_percent":62}}}`,
			status:   model.TaskStatusInProgress,
			progress: "62%",
		},
		{
			name:     "failed",
			body:     `{"task":{"task_id":"upstream","status":"TASK_STATUS_FAILED","reason":"content rejected"}}`,
			status:   model.TaskStatusFailure,
			progress: "100%",
			reason:   "content rejected",
		},
		{
			name:       "success without URL",
			body:       `{"task":{"task_id":"upstream","status":"TASK_STATUS_SUCCEED"}}`,
			shouldFail: true,
		},
		{
			name:       "empty status",
			body:       `{"task":{"task_id":"upstream","status":""}}`,
			shouldFail: true,
		},
		{
			name:     "API error becomes failed task",
			body:     `{"message":"insufficient balance"}`,
			status:   model.TaskStatusFailure,
			progress: "100%",
			reason:   "insufficient balance",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			result, err := (&TaskAdaptor{}).ParseTaskResult([]byte(test.body))
			if test.shouldFail {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, string(test.status), result.Status)
			assert.Equal(t, test.progress, result.Progress)
			assert.Equal(t, test.url, result.Url)
			assert.Equal(t, test.reason, result.Reason)
		})
	}
}

func TestTaskAdaptorBuildRequestBodyPreservesJiekouFields(t *testing.T) {
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Set("task_request", relaycommon.TaskSubmitReq{
		Prompt:   "A glass flower field",
		Duration: 5,
		Metadata: map[string]any{
			"generate_audio":   true,
			"reference_videos": []string{"https://example.com/reference.mp4"},
		},
	})
	info := &relaycommon.RelayInfo{ChannelMeta: &relaycommon.ChannelMeta{UpstreamModelName: ModelSeedance20}}

	body, err := (&TaskAdaptor{}).BuildRequestBody(c, info)
	require.NoError(t, err)
	data, err := io.ReadAll(body)
	require.NoError(t, err)

	var request map[string]any
	require.NoError(t, common.Unmarshal(data, &request))
	assert.Equal(t, "A glass flower field", request["prompt"])
	assert.Equal(t, false, request["fast"])
	assert.Equal(t, true, request["generate_audio"])
	assert.NotContains(t, request, "model")
}
