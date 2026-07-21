package common

import (
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/stretchr/testify/assert"
)

func TestMiniMaxMusicEndpointType(t *testing.T) {
	assert.Equal(t, []constant.EndpointType{constant.EndpointTypeMusic}, GetEndpointTypesByChannelType(constant.ChannelTypeMiniMax, "music-3.0"))
	assert.Equal(t, []constant.EndpointType{constant.EndpointTypeOpenAI}, GetEndpointTypesByChannelType(constant.ChannelTypeMiniMax, "MiniMax-M2.7"))
}

func TestMusicDefaultEndpoint(t *testing.T) {
	endpoint, ok := GetDefaultEndpointInfo(constant.EndpointTypeMusic)
	assert.True(t, ok)
	assert.Equal(t, "/v1/music_generation", endpoint.Path)
	assert.Equal(t, "POST", endpoint.Method)
}
