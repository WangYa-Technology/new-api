package minimax

import (
	"fmt"
	"io"
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
)

type MiniMaxMusicResponse struct {
	Data struct {
		Audio  string `json:"audio"`
		Status int    `json:"status"`
	} `json:"data"`
	TraceID  string          `json:"trace_id"`
	BaseResp MiniMaxBaseResp `json:"base_resp"`
}

func handleMusicResponse(c *gin.Context, resp *http.Response, info *relaycommon.RelayInfo) (any, *types.NewAPIError) {
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, types.NewErrorWithStatusCode(fmt.Errorf("failed to read MiniMax music response: %w", err), types.ErrorCodeReadResponseBodyFailed, http.StatusInternalServerError)
	}
	defer resp.Body.Close()

	var musicResp MiniMaxMusicResponse
	if err := common.Unmarshal(body, &musicResp); err != nil {
		return nil, types.NewErrorWithStatusCode(fmt.Errorf("failed to parse MiniMax music response: %w", err), types.ErrorCodeBadResponseBody, http.StatusBadGateway)
	}
	if musicResp.BaseResp.StatusCode != 0 {
		return nil, types.NewErrorWithStatusCode(fmt.Errorf("MiniMax music error: %d - %s", musicResp.BaseResp.StatusCode, musicResp.BaseResp.StatusMsg), types.ErrorCodeBadResponse, http.StatusBadRequest)
	}
	if musicResp.Data.Audio == "" {
		return nil, types.NewErrorWithStatusCode(fmt.Errorf("MiniMax music response contains no audio"), types.ErrorCodeEmptyResponse, http.StatusBadGateway)
	}

	for key, values := range resp.Header {
		if !service.ShouldCopyUpstreamHeader(c, key, values) {
			continue
		}
		for _, value := range values {
			c.Header(key, value)
		}
	}
	c.Data(http.StatusOK, "application/json", body)

	return &dto.Usage{PromptTokens: info.GetEstimatePromptTokens(), TotalTokens: 1}, nil
}
