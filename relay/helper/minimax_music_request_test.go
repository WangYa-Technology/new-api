package helper

import (
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newMiniMaxMusicTestContext(t *testing.T, body string) *gin.Context {
	t.Helper()
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest("POST", "/v1/music_generation", strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	return c
}

func TestGetAndValidateMiniMaxMusicRequest(t *testing.T) {
	gin.SetMode(gin.TestMode)

	tests := []struct {
		name    string
		body    string
		wantErr string
	}{
		{name: "instrumental", body: `{"model":"music-3.0","prompt":"warm piano","is_instrumental":true}`},
		{name: "lyrics", body: `{"model":"music-2.6","lyrics":"[Verse]\nHello"}`},
		{name: "missing content", body: `{"model":"music-3.0"}`, wantErr: "lyrics is required"},
		{name: "cover with URL", body: `{"model":"music-cover","prompt":"warm jazz cover","audio_url":"https://example.com/input.mp3"}`},
		{name: "cover without source", body: `{"model":"music-cover"}`, wantErr: "requires exactly one"},
		{name: "cover with multiple sources", body: `{"model":"music-cover","prompt":"warm jazz cover","audio_url":"https://example.com/input.mp3","audio_base64":"AAAA"}`, wantErr: "requires exactly one"},
		{name: "stream unsupported", body: `{"model":"music-3.0","prompt":"warm piano","is_instrumental":true,"stream":true}`, wantErr: "streaming music generation is not supported"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			request, err := GetAndValidateMiniMaxMusicRequest(newMiniMaxMusicTestContext(t, tt.body))
			if tt.wantErr != "" {
				require.Error(t, err)
				assert.Contains(t, err.Error(), tt.wantErr)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, "hex", request.OutputFormat)
		})
	}
}

func TestGetAndValidateMiniMaxMusicRequestPreservesExplicitFalse(t *testing.T) {
	request, err := GetAndValidateMiniMaxMusicRequest(newMiniMaxMusicTestContext(t, `{"model":"music-3.0","prompt":"piano","lyrics":"[Verse]\nHello","is_instrumental":false,"lyrics_optimizer":false,"aigc_watermark":false}`))
	require.NoError(t, err)
	require.NotNil(t, request.IsInstrumental)
	require.NotNil(t, request.LyricsOptimizer)
	require.NotNil(t, request.AigcWatermark)
	assert.False(t, *request.IsInstrumental)
	assert.False(t, *request.LyricsOptimizer)
	assert.False(t, *request.AigcWatermark)
}
