package common

import (
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/stretchr/testify/assert"
)

func TestTaskPluginChannelHasNoOrdinaryAPIType(t *testing.T) {
	apiType, ok := ChannelType2APIType(constant.ChannelTypeTaskPlugin)
	assert.Equal(t, -1, apiType)
	assert.False(t, ok)
}

func TestRetiredChannelsHaveNoOrdinaryAPIType(t *testing.T) {
	for _, channelType := range []int{59, 62, 63, 64} {
		apiType, ok := ChannelType2APIType(channelType)
		assert.Equal(t, -1, apiType)
		assert.False(t, ok)
	}
}
