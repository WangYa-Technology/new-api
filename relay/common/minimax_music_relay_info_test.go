package common

import (
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/dto"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGenRelayInfoMiniMaxMusic(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest("POST", "/v1/music_generation", nil)
	request := &dto.MiniMaxMusicRequest{Model: "music-3.0", Prompt: "warm piano"}

	info, err := GenRelayInfo(c, types.RelayFormatMiniMaxMusic, request, nil)
	require.NoError(t, err)
	assert.Equal(t, types.RelayFormatMiniMaxMusic, info.RelayFormat)
	assert.Equal(t, relayconstant.RelayModeMusicGeneration, info.RelayMode)
	assert.Same(t, request, info.Request)
}
