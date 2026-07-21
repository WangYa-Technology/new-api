package relay

import (
	"fmt"
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/relay/channel/minimax"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
)

func MiniMaxMusicHelper(c *gin.Context, info *relaycommon.RelayInfo) *types.NewAPIError {
	info.InitChannelMeta(c)
	musicReq, ok := info.Request.(*dto.MiniMaxMusicRequest)
	if !ok {
		return types.NewErrorWithStatusCode(fmt.Errorf("invalid request type, expected MiniMaxMusicRequest, got %T", info.Request), types.ErrorCodeInvalidRequest, http.StatusBadRequest, types.ErrOptionWithSkipRetry())
	}

	request, err := common.DeepCopy(musicReq)
	if err != nil {
		return types.NewError(fmt.Errorf("failed to copy MiniMax music request: %w", err), types.ErrorCodeInvalidRequest, types.ErrOptionWithSkipRetry())
	}
	if err := helper.ModelMappedHelper(c, info, request); err != nil {
		return types.NewError(err, types.ErrorCodeChannelModelMappedError, types.ErrOptionWithSkipRetry())
	}

	adaptor := &minimax.Adaptor{}
	adaptor.Init(info)
	requestBody, err := adaptor.ConvertMusicRequest(*request)
	if err != nil {
		return types.NewError(err, types.ErrorCodeConvertRequestFailed, types.ErrOptionWithSkipRetry())
	}
	resp, err := adaptor.DoRequest(c, info, requestBody)
	if err != nil {
		return types.NewOpenAIError(err, types.ErrorCodeDoRequestFailed, http.StatusInternalServerError)
	}
	httpResp := resp.(*http.Response)
	if httpResp.StatusCode != http.StatusOK {
		return service.RelayErrorHandler(c.Request.Context(), httpResp, false)
	}

	usage, apiErr := adaptor.DoResponse(c, httpResp, info)
	if apiErr != nil {
		return apiErr
	}
	service.PostTextConsumeQuota(c, info, usage.(*dto.Usage), []string{"MiniMax music generation"})
	return nil
}
