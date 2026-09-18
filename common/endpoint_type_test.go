package common

import (
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/stretchr/testify/assert"
)

func TestGetEndpointTypesByChannelTypeJiekouSeedance(t *testing.T) {
	endpointTypes := GetEndpointTypesByChannelType(constant.ChannelTypeJiekouSeedance, "seedance-2.0")

	assert.Equal(t, []constant.EndpointType{constant.EndpointTypeOpenAIVideo}, endpointTypes)
}

func TestHCAIOnlyAdvertisesImageEndpoint(t *testing.T) {
	for _, model := range []string{"gpt-image-2", "custom-image-model"} {
		t.Run(model, func(t *testing.T) {
			assert.Equal(t, []constant.EndpointType{constant.EndpointTypeImageGeneration},
				GetEndpointTypesByChannelType(constant.ChannelTypeHCAI, model))
		})
	}
}

func TestVideoRelayChannelEndpoints(t *testing.T) {
	assert.Equal(t, []constant.EndpointType{constant.EndpointTypeOpenAIVideo},
		GetEndpointTypesByChannelType(constant.ChannelTypeKeyiyun, "Wan3.0"))
	assert.Equal(t, []constant.EndpointType{constant.EndpointTypeOpenAIVideo},
		GetEndpointTypesByChannelType(constant.ChannelTypeKemei, "kling-v3"))
}
