package minimax

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestHandleMusicResponse(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	resp := &http.Response{
		StatusCode: http.StatusOK,
		Header:     http.Header{"Content-Type": []string{"application/json"}},
		Body:       io.NopCloser(strings.NewReader(`{"data":{"audio":"https://example.com/song.mp3","status":2},"base_resp":{"status_code":0,"status_msg":"success"}}`)),
	}

	usage, apiErr := handleMusicResponse(c, resp, &relaycommon.RelayInfo{})
	require.Nil(t, apiErr)
	require.NotNil(t, usage)
	assert.Equal(t, http.StatusOK, recorder.Code)
	assert.Contains(t, recorder.Body.String(), "song.mp3")
}

func TestHandleMusicResponseRejectsUpstreamError(t *testing.T) {
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	resp := &http.Response{
		StatusCode: http.StatusOK,
		Body:       io.NopCloser(strings.NewReader(`{"base_resp":{"status_code":1004,"status_msg":"invalid parameter"}}`)),
	}

	_, apiErr := handleMusicResponse(c, resp, &relaycommon.RelayInfo{})
	require.NotNil(t, apiErr)
	assert.Contains(t, apiErr.Error(), "invalid parameter")
}
