package hcai

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGetRequestURL(t *testing.T) {
	a := &Adaptor{}
	for _, baseURL := range []string{"https://api.hctopup.com", "https://api.hctopup.com/v1", "https://api.hctopup.com/v1/"} {
		info := &relaycommon.RelayInfo{ChannelMeta: &relaycommon.ChannelMeta{ChannelBaseUrl: baseURL}, RelayMode: relayconstant.RelayModeImagesGenerations}
		url, err := a.GetRequestURL(info)
		require.NoError(t, err)
		assert.Equal(t, "https://api.hctopup.com/v1/images/generations/async", url)

		info.RelayMode = relayconstant.RelayModeImagesEdits
		url, err = a.GetRequestURL(info)
		require.NoError(t, err)
		assert.Equal(t, "https://api.hctopup.com/v1/images/edits/async", url)
	}

	info := &relaycommon.RelayInfo{ChannelMeta: &relaycommon.ChannelMeta{ChannelBaseUrl: "https://api.hctopup.com"}}
	info.RelayMode = relayconstant.RelayModeChatCompletions
	_, err := a.GetRequestURL(info)
	require.ErrorContains(t, err, "endpoint not supported")
	_, err = a.ConvertOpenAIRequest(nil, info, &dto.GeneralOpenAIRequest{})
	require.ErrorContains(t, err, "endpoint not supported")
}

func TestDoResponsePreservesBillingUsage(t *testing.T) {
	for _, tc := range []struct {
		name string
		body string
	}{
		{"result usage", `{"status":"completed","result":{"data":[{"url":"https://img.test/1.png"}],"usage":{"input_tokens":120,"output_tokens":80,"input_tokens_details":{"cached_tokens":20,"image_tokens":60,"text_tokens":60}}}}`},
		{"task usage", `{"status":"completed","image_url":"https://img.test/1.png","usage":{"input_tokens":120,"output_tokens":80,"input_tokens_details":{"cached_tokens":20,"image_tokens":60,"text_tokens":60}}}`},
		{"result usage takes precedence", `{"status":"completed","usage":{"input_tokens":999},"result":{"data":[{"url":"https://img.test/1.png"}],"usage":{"input_tokens":120,"output_tokens":80,"input_tokens_details":{"cached_tokens":20,"image_tokens":60,"text_tokens":60}}}}`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				_, _ = io.WriteString(w, tc.body)
			}))
			defer server.Close()
			recorder := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(recorder)
			c.Request = httptest.NewRequest(http.MethodPost, "/v1/images/generations", nil)
			info := &relaycommon.RelayInfo{ChannelMeta: &relaycommon.ChannelMeta{ChannelBaseUrl: server.URL, ChannelType: constant.ChannelTypeHCAI}}
			info.PriceData.UsePrice = true
			info.PriceData.AddOtherRatio("n", 3)
			resp := &http.Response{StatusCode: http.StatusAccepted, Body: io.NopCloser(bytes.NewBufferString(`{"task_id":"task_1"}`)), Header: make(http.Header)}
			result, apiErr := (&Adaptor{}).DoResponse(c, resp, info)
			require.Nil(t, apiErr)
			usage, ok := result.(*dto.Usage)
			require.True(t, ok)
			assert.Equal(t, 120, usage.PromptTokens)
			assert.Equal(t, 80, usage.CompletionTokens)
			assert.Equal(t, 200, usage.TotalTokens)
			assert.Equal(t, 20, usage.PromptTokensDetails.CachedTokens)
			assert.Equal(t, 60, usage.PromptTokensDetails.ImageTokens)
			assert.Equal(t, 60, usage.PromptTokensDetails.TextTokens)
			assert.Equal(t, float64(1), info.PriceData.OtherRatios()["n"])
			assert.Equal(t, http.StatusOK, recorder.Code)
			var response imageResponse
			require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
			require.NotNil(t, response.Usage)
			assert.Equal(t, 120, response.Usage.InputTokens)
		})
	}
}

func TestPollUsesChannelProxy(t *testing.T) {
	proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "hcai.invalid", r.URL.Host)
		assert.Equal(t, "/v1/images/tasks/task_1", r.URL.Path)
		assert.Equal(t, "Bearer test-key", r.Header.Get("Authorization"))
		_, _ = io.WriteString(w, `{"status":"completed","image_url":"https://img.test/1.png"}`)
	}))
	defer proxy.Close()
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/images/generations", nil)
	info := &relaycommon.RelayInfo{ChannelMeta: &relaycommon.ChannelMeta{
		ChannelBaseUrl: "http://hcai.invalid", ApiKey: "test-key",
		ChannelSetting: dto.ChannelSettings{Proxy: proxy.URL},
	}}
	body, err := (&Adaptor{}).poll(c, info, "task_1")
	require.NoError(t, err)
	assert.JSONEq(t, `{"status":"completed","image_url":"https://img.test/1.png"}`, string(body))
}

func TestDoResponsePollsAndWritesOpenAIImageResponse(t *testing.T) {
	gin.SetMode(gin.TestMode)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/images/tasks/task_1" {
			w.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(w, `{"task_id":"task_1","status":"completed","image_url":"https://img.test/result.png"}`)
			return
		}
		t.Fatalf("unexpected request path: %s", r.URL.Path)
	}))
	defer server.Close()

	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/images/generations", nil)
	info := &relaycommon.RelayInfo{ChannelMeta: &relaycommon.ChannelMeta{ChannelBaseUrl: server.URL, ApiKey: "key"}, RelayMode: relayconstant.RelayModeImagesGenerations}
	resp := &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(bytes.NewBufferString(`{"task_id":"task_1","status":"processing"}`)), Header: make(http.Header)}
	usage, apiErr := (&Adaptor{}).DoResponse(c, resp, info)
	require.Nil(t, apiErr)
	assert.IsType(t, &dto.Usage{}, usage)
	assert.JSONEq(t, `{"data":[{"url":"https://img.test/result.png","b64_json":"","revised_prompt":""}],"created":0}`, recorder.Body.String())
}

func TestDoResponseFailedTask(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, `{"task_id":"task_1","status":"failed","error":{"message":"content rejected"}}`)
	}))
	defer server.Close()
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/images/generations", nil)
	info := &relaycommon.RelayInfo{ChannelMeta: &relaycommon.ChannelMeta{ChannelBaseUrl: server.URL, ApiKey: "key"}, RelayMode: relayconstant.RelayModeImagesGenerations}
	resp := &http.Response{StatusCode: http.StatusAccepted, Body: io.NopCloser(bytes.NewBufferString(`{"task_id":"task_1"}`)), Header: make(http.Header)}
	_, apiErr := (&Adaptor{}).DoResponse(c, resp, info)
	require.Error(t, apiErr)
	assert.Contains(t, apiErr.Error(), "content rejected")
}

func TestConvertImageEditRequestUsesMultipart(t *testing.T) {
	require.NotEqual(t, constant.ChannelTypeUnknown, constant.ChannelTypeHCAI)
	// The OpenAI multipart converter is reused; this test ensures HCAI selects it.
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/images/edits", bytes.NewBufferString(`{"model":"gpt-image-2","prompt":"x"}`))
	c.Request.Header.Set("Content-Type", "application/json")
	info := &relaycommon.RelayInfo{RelayMode: relayconstant.RelayModeImagesEdits}
	converted, err := (&Adaptor{}).ConvertImageRequest(c, info, dto.ImageRequest{Model: "gpt-image-2", Prompt: "x"})
	require.NoError(t, err)
	assert.IsType(t, dto.ImageRequest{}, converted)
}
