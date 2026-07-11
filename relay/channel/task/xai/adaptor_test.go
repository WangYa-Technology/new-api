package xai

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

func TestBuildRequestBodyNormalizesImage(t *testing.T) {
	gin.SetMode(gin.TestMode)
	tests := []struct {
		name  string
		image string
	}{
		{name: "string", image: `"https://example.com/input.png"`},
		{name: "object", image: `{"url":"https://example.com/input.png"}`},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			body := []byte(`{"model":"client-model","prompt":"animate","image":` + test.image + `}`)
			context, _ := gin.CreateTestContext(httptest.NewRecorder())
			context.Request = httptest.NewRequest(http.MethodPost, "/v1/videos/generations", bytes.NewReader(body))
			context.Request.Header.Set("Content-Type", "application/json")

			adaptor := &TaskAdaptor{}
			converted, err := adaptor.BuildRequestBody(context, &relaycommon.RelayInfo{
				ChannelMeta: &relaycommon.ChannelMeta{UpstreamModelName: "upstream-model"},
			})
			require.NoError(t, err)
			convertedBody, err := io.ReadAll(converted)
			require.NoError(t, err)

			var payload map[string]any
			require.NoError(t, common.Unmarshal(convertedBody, &payload))
			assert.Equal(t, "upstream-model", payload["model"])
			assert.Equal(t, map[string]any{"url": "https://example.com/input.png"}, payload["image"])
		})
	}
}

func TestDoResponseUsesPublicRequestID(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	response := &http.Response{
		StatusCode: http.StatusOK,
		Body:       io.NopCloser(bytes.NewBufferString(`{"request_id":"upstream-id"}`)),
	}

	adaptor := &TaskAdaptor{}
	upstreamID, _, taskErr := adaptor.DoResponse(context, response, &relaycommon.RelayInfo{
		TaskRelayInfo: &relaycommon.TaskRelayInfo{PublicTaskID: "task_public"},
	})

	require.Nil(t, taskErr)
	assert.Equal(t, "upstream-id", upstreamID)
	assert.JSONEq(t, `{"request_id":"task_public"}`, recorder.Body.String())
}

func TestParseTaskResultDone(t *testing.T) {
	adaptor := &TaskAdaptor{}
	result, err := adaptor.ParseTaskResult([]byte(`{
		"status":"done",
		"progress":100,
		"video":{"url":"https://example.com/video.mp4","duration":10}
	}`))

	require.NoError(t, err)
	assert.Equal(t, string(model.TaskStatusSuccess), result.Status)
	assert.Equal(t, "100%", result.Progress)
	assert.Equal(t, "https://example.com/video.mp4", result.Url)
}

func TestConvertToOpenAIVideoMasksUpstreamRequestID(t *testing.T) {
	adaptor := &TaskAdaptor{}
	converted, err := adaptor.ConvertToOpenAIVideo(&model.Task{
		TaskID: "task_public",
		Data:   []byte(`{"request_id":"upstream-id"}`),
	})

	require.NoError(t, err)
	assert.JSONEq(t, `{"request_id":"task_public"}`, string(converted))
}
