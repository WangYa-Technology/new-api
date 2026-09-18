package siliconflow

import (
	"testing"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relay/constant"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGetRequestURLAcceptsVersionedBaseURL(t *testing.T) {
	adaptor := &Adaptor{}
	info := &relaycommon.RelayInfo{ChannelMeta: &relaycommon.ChannelMeta{}}
	info.ChannelBaseUrl = "https://api.siliconflow.cn/v1/"
	info.RequestURLPath = "/v1/chat/completions"

	url, err := adaptor.GetRequestURL(info)
	require.NoError(t, err)
	assert.Equal(t, "https://api.siliconflow.cn/v1/chat/completions", url)

	info.RelayMode = constant.RelayModeRerank
	url, err = adaptor.GetRequestURL(info)
	require.NoError(t, err)
	assert.Equal(t, "https://api.siliconflow.cn/v1/rerank", url)
}
