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
