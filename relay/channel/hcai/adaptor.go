package hcai

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/relay/channel"
	"github.com/QuantumNous/new-api/relay/channel/openai"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

const ChannelName = "HCAI"

type Adaptor struct {
	openai openai.Adaptor
}

func (a *Adaptor) Init(info *relaycommon.RelayInfo) {
	a.openai.Init(info)
}

func (a *Adaptor) GetRequestURL(info *relaycommon.RelayInfo) (string, error) {
	if info == nil {
		return "", errors.New("hcai adaptor: relay info is nil")
	}
	base := strings.TrimRight(info.ChannelBaseUrl, "/")
	base = strings.TrimSuffix(base, "/v1")
	var path string
	switch info.RelayMode {
	case relayconstant.RelayModeImagesGenerations:
		path = "/v1/images/generations/async"
	case relayconstant.RelayModeImagesEdits:
		path = "/v1/images/edits/async"
	default:
		return "", errors.New("endpoint not supported")
	}
	return base + path, nil
}

func (a *Adaptor) SetupRequestHeader(c *gin.Context, req *http.Header, info *relaycommon.RelayInfo) error {
	channel.SetupApiRequestHeader(info, c, req)
	req.Set("Authorization", "Bearer "+info.ApiKey)
	if req.Get("Content-Type") == "" {
		req.Set("Content-Type", "application/json")
	}
	if req.Get("Accept") == "" {
		req.Set("Accept", "application/json")
	}
	return nil
}

func (a *Adaptor) ConvertOpenAIRequest(c *gin.Context, info *relaycommon.RelayInfo, request *dto.GeneralOpenAIRequest) (any, error) {
	return nil, errors.New("endpoint not supported")
}
func (a *Adaptor) ConvertRerankRequest(c *gin.Context, relayMode int, request dto.RerankRequest) (any, error) {
	return nil, errors.New("endpoint not supported")
}
func (a *Adaptor) ConvertEmbeddingRequest(c *gin.Context, info *relaycommon.RelayInfo, request dto.EmbeddingRequest) (any, error) {
	return nil, errors.New("endpoint not supported")
}
func (a *Adaptor) ConvertAudioRequest(c *gin.Context, info *relaycommon.RelayInfo, request dto.AudioRequest) (io.Reader, error) {
	return nil, errors.New("endpoint not supported")
}
func (a *Adaptor) ConvertImageRequest(c *gin.Context, info *relaycommon.RelayInfo, request dto.ImageRequest) (any, error) {
	if info.RelayMode == relayconstant.RelayModeImagesEdits {
		return a.openai.ConvertImageRequest(c, info, request)
	}
	return request, nil
}
func (a *Adaptor) ConvertOpenAIResponsesRequest(c *gin.Context, info *relaycommon.RelayInfo, request dto.OpenAIResponsesRequest) (any, error) {
	return nil, errors.New("endpoint not supported")
}
func (a *Adaptor) ConvertClaudeRequest(c *gin.Context, info *relaycommon.RelayInfo, request *dto.ClaudeRequest) (any, error) {
	return nil, errors.New("endpoint not supported")
}
func (a *Adaptor) ConvertGeminiRequest(c *gin.Context, info *relaycommon.RelayInfo, request *dto.GeminiChatRequest) (any, error) {
	return nil, errors.New("endpoint not supported")
}

func (a *Adaptor) DoRequest(c *gin.Context, info *relaycommon.RelayInfo, requestBody io.Reader) (any, error) {
	if info.RelayMode == relayconstant.RelayModeImagesEdits && !strings.HasPrefix(c.Request.Header.Get("Content-Type"), "application/json") {
		return channel.DoFormRequest(a, c, info, requestBody)
	}
	return channel.DoApiRequest(a, c, info, requestBody)
}

type submitResponse struct {
	TaskID string `json:"task_id"`
	ID     string `json:"id"`
}
type imageResponse struct {
	dto.ImageResponse
	Usage *dto.Usage `json:"usage,omitempty"`
}

type taskResponse struct {
	TaskID   string         `json:"task_id"`
	Status   string         `json:"status"`
	ImageURL string         `json:"image_url"`
	Result   *imageResponse `json:"result"`
	Usage    *dto.Usage     `json:"usage,omitempty"`
	Error    *struct {
		Message string `json:"message"`
	} `json:"error"`
}

func (a *Adaptor) DoResponse(c *gin.Context, resp *http.Response, info *relaycommon.RelayInfo) (any, *types.NewAPIError) {
	if resp == nil || resp.Body == nil {
		return nil, types.NewOpenAIError(errors.New("invalid HCAI response"), types.ErrorCodeBadResponse, http.StatusBadGateway)
	}
	body, err := io.ReadAll(resp.Body)
	resp.Body.Close()
	if err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeReadResponseBodyFailed, http.StatusBadGateway)
	}
	var submit submitResponse
	if err = common.Unmarshal(body, &submit); err != nil {
		return nil, types.NewOpenAIError(fmt.Errorf("invalid HCAI task response: %s", string(body)), types.ErrorCodeBadResponseBody, http.StatusBadGateway)
	}
	if submit.TaskID == "" {
		submit.TaskID = submit.ID
	}
	if submit.TaskID == "" {
		return nil, types.NewOpenAIError(fmt.Errorf("invalid HCAI task response: %s", string(body)), types.ErrorCodeBadResponseBody, http.StatusBadGateway)
	}

	resultBody, err := a.poll(c, info, submit.TaskID)
	if err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeBadResponse, http.StatusBadGateway)
	}
	var task taskResponse
	if err = common.Unmarshal(resultBody, &task); err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeBadResponseBody, http.StatusBadGateway)
	}
	if task.Status != "completed" {
		message := "HCAI image task failed"
		if task.Error != nil && task.Error.Message != "" {
			message = task.Error.Message
		}
		return nil, types.NewOpenAIError(errors.New(message), types.ErrorCodeBadResponse, http.StatusBadGateway)
	}
	imageResp := task.Result
	if imageResp == nil {
		imageResp = &imageResponse{}
	}
	if len(imageResp.Data) == 0 && task.ImageURL != "" {
		imageResp.Data = []dto.ImageData{{Url: task.ImageURL}}
	}
	if imageResp.Usage == nil {
		imageResp.Usage = task.Usage
	}
	encoded, err := common.Marshal(imageResp)
	if err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeBadResponseBody, http.StatusBadGateway)
	}
	// Use the shared image handler for usage normalization and actual image counts.
	resultResponse := *resp
	resultResponse.StatusCode = http.StatusOK
	resultResponse.Header = resp.Header.Clone()
	if resultResponse.Header == nil {
		resultResponse.Header = make(http.Header)
	}
	resultResponse.Header.Set("Content-Type", "application/json")
	resultResponse.Body = io.NopCloser(bytes.NewReader(encoded))
	return openai.OpenaiImageHandler(c, info, &resultResponse)
}

func (a *Adaptor) poll(c *gin.Context, info *relaycommon.RelayInfo, taskID string) ([]byte, error) {
	base := strings.TrimRight(info.ChannelBaseUrl, "/")
	base = strings.TrimSuffix(base, "/v1")
	url := fmt.Sprintf("%s/v1/images/tasks/%s", base, taskID)
	client, err := service.GetHttpClientWithProxySettings(info.ChannelSetting.Proxy, info.ChannelSetting)
	if err != nil {
		return nil, err
	}
	pollClient := *client
	pollClient.Timeout = 30 * time.Second
	for i := 0; i < 120; i++ {
		if i > 0 {
			select {
			case <-c.Request.Context().Done():
				return nil, c.Request.Context().Err()
			case <-time.After(3 * time.Second):
			}
		}
		req, err := http.NewRequestWithContext(c.Request.Context(), http.MethodGet, url, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Authorization", "Bearer "+info.ApiKey)
		response, err := pollClient.Do(req)
		if err != nil {
			return nil, err
		}
		body, readErr := io.ReadAll(response.Body)
		response.Body.Close()
		if readErr != nil {
			return nil, readErr
		}
		if response.StatusCode < 200 || response.StatusCode >= 300 {
			return nil, fmt.Errorf("HCAI task query returned HTTP %d", response.StatusCode)
		}
		var state taskResponse
		if err := common.Unmarshal(body, &state); err != nil {
			return nil, err
		}
		if state.Status == "completed" || state.Status == "failed" {
			return body, nil
		}
	}
	return nil, errors.New("HCAI image task polling timeout")
}

func (a *Adaptor) GetModelList() []string { return nil }
func (a *Adaptor) GetChannelName() string { return ChannelName }

var _ channel.Adaptor = (*Adaptor)(nil)
