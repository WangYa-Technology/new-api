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
	"github.com/QuantumNous/new-api/setting/ratio_setting"
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
			name:  "seedance 1.5 supports 1080p and fps",
			model: ModelSeedance15ProT2V,
			request: relaycommon.TaskSubmitReq{
				Prompt:   "A city at sunrise",
				Size:     "1920x1080",
				Duration: 10,
				Metadata: map[string]any{"fps": 24, "ratio": "1:1"},
			},
			assertion: func(t *testing.T, request *submitRequest) {
				assert.Equal(t, "1080p", request.Resolution)
				assert.Equal(t, "16:9", request.Ratio)
				require.NotNil(t, request.FPS)
				assert.Equal(t, 24, *request.FPS)
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
			model:   ModelSeedance15ProI2V,
			request: relaycommon.TaskSubmitReq{Prompt: "Animate this", Duration: 5},
			message: "requires an input image",
		},
		{
			name:    "text model rejects image",
			model:   ModelSeedance15ProT2V,
			request: relaycommon.TaskSubmitReq{Prompt: "Create a video", Images: []string{"https://example.com/frame.png"}, Duration: 5},
			message: "does not accept input images",
		},
		{
			name:    "fast model rejects 1080p",
			model:   ModelSeedance20Fast,
			request: relaycommon.TaskSubmitReq{Prompt: "Create a video", Size: "1080p", Duration: 5},
			message: "does not support resolution",
		},
		{
			name:    "seedance 1.5 rejects unsupported duration",
			model:   ModelSeedance15ProT2V,
			request: relaycommon.TaskSubmitReq{Prompt: "Create a video", Duration: 13},
			message: "duration must be between 4 and 12 seconds",
		},
		{
			name:    "seedance 2 rejects service tier",
			model:   ModelSeedance20,
			request: relaycommon.TaskSubmitReq{Prompt: "Create a video", Duration: 5, Metadata: map[string]any{"service_tier": "flex"}},
			message: "does not support service_tier",
		},
		{
			name:    "seedance 1.5 rejects unsupported fps",
			model:   ModelSeedance15ProT2V,
			request: relaycommon.TaskSubmitReq{Prompt: "Create a video", Duration: 5, Metadata: map[string]any{"fps": 30}},
			message: "only supports 24 fps",
		},
		{
			name:    "seedance 1.5 rejects reference inputs",
			model:   ModelSeedance15ProT2V,
			request: relaycommon.TaskSubmitReq{Prompt: "Create a video", Duration: 5, Metadata: map[string]any{"reference_videos": []string{"https://example.com/reference.mp4"}}},
			message: "does not support reference inputs",
		},
		{
			name:    "seedance 2 rejects 1.5 parameters",
			model:   ModelSeedance20,
			request: relaycommon.TaskSubmitReq{Prompt: "Create a video", Duration: 5, Metadata: map[string]any{"camera_fixed": true}},
			message: "does not support camera_fixed",
		},
		{
			name:    "reference audio requires visual reference",
			model:   ModelSeedance20,
			request: relaycommon.TaskSubmitReq{Prompt: "Create a video", Duration: 5, Metadata: map[string]any{"reference_audios": []string{"https://example.com/reference.mp3"}}},
			message: "requires a reference image or video",
		},
		{
			name:    "rejects unknown ratio",
			model:   ModelSeedance20,
			request: relaycommon.TaskSubmitReq{Prompt: "Create a video", Duration: 5, Metadata: map[string]any{"ratio": "2:1"}},
			message: "does not support ratio",
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

func TestValidateRequestRejectsInvalidParametersBeforeBilling(t *testing.T) {
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/videos", strings.NewReader(`{"model":"seedance-2.0-fast","prompt":"Create a video","size":"1080p"}`))
	c.Request.Header.Set("Content-Type", "application/json")
	info := &relaycommon.RelayInfo{
		OriginModelName: ModelSeedance20Fast,
		TaskRelayInfo:   &relaycommon.TaskRelayInfo{},
	}

	taskErr := (&TaskAdaptor{}).ValidateRequestAndSetAction(c, info)

	require.NotNil(t, taskErr)
	assert.Equal(t, http.StatusBadRequest, taskErr.StatusCode)
	assert.Contains(t, taskErr.Message, "does not support resolution")
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

	assert.InDelta(t, 0.3742*10/0.1512, ratios["charge"], 0.000001)
	assert.NotContains(t, ratios, "service_tier")

	c.Set("task_request", relaycommon.TaskSubmitReq{
		Prompt:   "Animate the image",
		Images:   []string{"https://example.com/frame.png"},
		Size:     "720p",
		Duration: 10,
		Metadata: map[string]any{"service_tier": "flex", "generate_audio": false},
	})
	info.OriginModelName = ModelSeedance15ProI2V
	info.UpstreamModelName = ModelSeedance15ProI2V
	ratios = (&TaskAdaptor{}).EstimateBilling(c, info)
	assert.InDelta(t, 0.026*10/0.052, ratios["charge"], 0.000001)
	assert.Equal(t, 0.5, ratios["service_tier"])

	c.Set("task_request", relaycommon.TaskSubmitReq{
		Prompt:   "Use the reference motion",
		Size:     "720p",
		Duration: 4,
		Metadata: map[string]any{"reference_videos": []string{"https://example.com/reference.mp4"}},
	})
	info.OriginModelName = ModelSeedance20
	info.UpstreamModelName = ModelSeedance20
	ratios = (&TaskAdaptor{}).EstimateBilling(c, info)
	assert.InDelta(t, 0.65/0.1512, ratios["charge"], 0.000001)
}

func TestBillingRatiosUseLiveSKUPrices(t *testing.T) {
	tests := []struct {
		name           string
		model          string
		payload        submitRequest
		expectedCharge float64
		expectedTier   float64
	}{
		{
			name:           "seedance 2 standard 480p",
			model:          ModelSeedance20,
			payload:        submitRequest{Duration: 5, Resolution: "480p"},
			expectedCharge: 0.0703 * 5,
		},
		{
			name:           "seedance 2 fast 720p",
			model:          ModelSeedance20Fast,
			payload:        submitRequest{Duration: 8, Resolution: "720p"},
			expectedCharge: 0.121 * 8,
		},
		{
			name:           "seedance 2 reference video minimum",
			model:          ModelSeedance20Fast,
			payload:        submitRequest{Duration: 15, Resolution: "720p", ReferenceVideos: []string{"https://example.com/reference.mp4"}},
			expectedCharge: 1.78,
		},
		{
			name:           "seedance 1.5 audio 1080p",
			model:          ModelSeedance15ProT2V,
			payload:        submitRequest{Duration: 4, Resolution: "1080p"},
			expectedCharge: 0.116 * 4,
		},
		{
			name:           "seedance 1.5 silent flex 480p",
			model:          ModelSeedance15ProI2V,
			payload:        submitRequest{Duration: 12, Resolution: "480p", GenerateAudio: common.GetPointer(false), ServiceTier: "flex"},
			expectedCharge: 0.012 * 12,
			expectedTier:   0.5,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			ratios := billingRatios(&test.payload, test.model)
			actualCharge := ratios["charge"] * modelConfigs[test.model].basePrice
			assert.InDelta(t, test.expectedCharge, actualCharge, 0.000001)
			if test.expectedTier == 0 {
				assert.NotContains(t, ratios, "service_tier")
			} else {
				assert.Equal(t, test.expectedTier, ratios["service_tier"])
			}
		})
	}
}

func TestDefaultModelPricesMatchBillingBase(t *testing.T) {
	defaultPrices := ratio_setting.GetDefaultModelPriceMap()
	for modelName, config := range modelConfigs {
		assert.Equal(t, config.basePrice, defaultPrices[modelName], modelName)
	}
}

func TestModelListOnlyContainsRealtimeJiekouProducts(t *testing.T) {
	assert.Equal(t, []string{
		ModelSeedance20,
		ModelSeedance20Fast,
		ModelSeedance15ProT2V,
		ModelSeedance15ProI2V,
	}, ModelList)
	for _, modelName := range ModelList {
		config, ok := modelConfigs[modelName]
		require.True(t, ok, modelName)
		assert.Positive(t, config.basePrice, modelName)
		for resolution := range config.allowedResolution {
			assert.Positive(t, perSecondPrices[modelName][resolution], modelName+" "+resolution)
		}
	}
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
