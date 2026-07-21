package ratio_setting

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestMiniMaxMusicDefaultPrices(t *testing.T) {
	assert.Equal(t, 0.15, defaultModelPrice["music-3.0"])
	assert.Equal(t, 0.15, defaultModelPrice["music-2.6"])
	assert.Equal(t, 0.15, defaultModelPrice["music-cover"])
	assert.Equal(t, float64(0), defaultModelPrice["music-3.0-free"])
	assert.Equal(t, float64(0), defaultModelPrice["music-2.6-free"])
	assert.Equal(t, float64(0), defaultModelPrice["music-cover-free"])
}
