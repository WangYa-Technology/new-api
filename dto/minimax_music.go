package dto

import (
	"strings"

	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
)

type MiniMaxMusicAudioSetting struct {
	SampleRate int    `json:"sample_rate,omitempty"`
	Bitrate    int    `json:"bitrate,omitempty"`
	Format     string `json:"format,omitempty"`
}

type MiniMaxMusicRequest struct {
	Model           string                    `json:"model"`
	Prompt          string                    `json:"prompt,omitempty"`
	Lyrics          string                    `json:"lyrics,omitempty"`
	Stream          *bool                     `json:"stream,omitempty"`
	OutputFormat    string                    `json:"output_format,omitempty"`
	AudioSetting    *MiniMaxMusicAudioSetting `json:"audio_setting,omitempty"`
	AigcWatermark   *bool                     `json:"aigc_watermark,omitempty"`
	LyricsOptimizer *bool                     `json:"lyrics_optimizer,omitempty"`
	IsInstrumental  *bool                     `json:"is_instrumental,omitempty"`
	AudioURL        string                    `json:"audio_url,omitempty"`
	AudioBase64     string                    `json:"audio_base64,omitempty"`
	CoverFeatureID  string                    `json:"cover_feature_id,omitempty"`
}

func (r *MiniMaxMusicRequest) GetTokenCountMeta() *types.TokenCountMeta {
	return &types.TokenCountMeta{CombineText: strings.TrimSpace(r.Prompt + "\n" + r.Lyrics), TokenType: types.TokenTypeTextNumber}
}

func (r *MiniMaxMusicRequest) IsStream(*gin.Context) bool {
	return r.Stream != nil && *r.Stream
}

func (r *MiniMaxMusicRequest) SetModelName(modelName string) {
	if modelName != "" {
		r.Model = modelName
	}
}
