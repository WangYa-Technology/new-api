package siliconflow

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	taskdto "github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relay/channel"
	taskcommon "github.com/QuantumNous/new-api/relay/channel/task/taskcommon"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

const (
	ChannelName = "siliconflow-video"

	ModelWan22I2V = "Wan-AI/Wan2.2-I2V-A14B"
	ModelWan22T2V = "Wan-AI/Wan2.2-T2V-A14B"
)

var ModelList = []string{ModelWan22I2V, ModelWan22T2V}

type submitRequest struct {
	Model          string `json:"model"`
	Prompt         string `json:"prompt"`
	NegativePrompt string `json:"negative_prompt,omitempty"`
	ImageSize      string `json:"image_size"`
	Image          string `json:"image,omitempty"`
	Seed           *int64 `json:"seed,omitempty"`
}

type submitResponse struct {
	RequestID string `json:"requestId"`
	Code      any    `json:"code,omitempty"`
	Message   string `json:"message,omitempty"`
}

type statusResponse struct {
	Status  string `json:"status"`
	Reason  string `json:"reason,omitempty"`
	Code    any    `json:"code,omitempty"`
	Message string `json:"message,omitempty"`
	Results struct {
		Videos []struct {
			URL string `json:"url"`
		} `json:"videos,omitempty"`
	} `json:"results,omitempty"`
}

type TaskAdaptor struct {
	taskcommon.BaseBilling
	apiKey  string
	baseURL string
}

var _ channel.TaskAdaptor = (*TaskAdaptor)(nil)
var _ channel.OpenAIVideoConverter = (*TaskAdaptor)(nil)

func (a *TaskAdaptor) Init(info *relaycommon.RelayInfo) {
	a.apiKey = info.ApiKey
	a.baseURL = strings.TrimRight(info.ChannelBaseUrl, "/")
	if a.baseURL == "" {
		a.baseURL = constant.ChannelBaseURLs[constant.ChannelTypeSiliconFlow]
	}
}

func (a *TaskAdaptor) ValidateRequestAndSetAction(c *gin.Context, info *relaycommon.RelayInfo) *taskdto.TaskError {
	if taskErr := relaycommon.ValidateBasicTaskRequest(c, info, constant.TaskActionGenerate); taskErr != nil {
		return taskErr
	}
	req, err := relaycommon.GetTaskRequest(c)
	if err != nil {
		return service.TaskErrorWrapperLocal(err, "invalid_request", http.StatusBadRequest)
	}
	if _, err := buildSubmitRequest(req, info.OriginModelName); err != nil {
		return service.TaskErrorWrapperLocal(err, "invalid_request", http.StatusBadRequest)
	}
	return nil
}

func (a *TaskAdaptor) BuildRequestURL(_ *relaycommon.RelayInfo) (string, error) {
	baseURL := strings.TrimSuffix(a.baseURL, "/v1")
	return baseURL + "/v1/video/submit", nil
}

func (a *TaskAdaptor) BuildRequestHeader(_ *gin.Context, req *http.Request, _ *relaycommon.RelayInfo) error {
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+a.apiKey)
	return nil
}

func (a *TaskAdaptor) BuildRequestBody(c *gin.Context, info *relaycommon.RelayInfo) (io.Reader, error) {
	req, err := relaycommon.GetTaskRequest(c)
	if err != nil {
		return nil, err
	}
	payload, err := buildSubmitRequest(req, info.UpstreamModelName)
	if err != nil {
		return nil, err
	}
	data, err := common.Marshal(payload)
	if err != nil {
		return nil, err
	}
	return bytes.NewReader(data), nil
}

func (a *TaskAdaptor) DoRequest(c *gin.Context, info *relaycommon.RelayInfo, requestBody io.Reader) (*http.Response, error) {
	return channel.DoTaskApiRequest(a, c, info, requestBody)
}

func (a *TaskAdaptor) ParseResponse(_ *gin.Context, resp *http.Response, info *relaycommon.RelayInfo) (*channel.TaskSubmitResponse, *taskdto.TaskError) {
	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, service.TaskErrorWrapper(err, "read_response_body_failed", http.StatusInternalServerError)
	}
	_ = resp.Body.Close()

	var result submitResponse
	if err := common.Unmarshal(responseBody, &result); err != nil {
		return nil, service.TaskErrorWrapper(fmt.Errorf("unmarshal SiliconFlow response: %w", err), "unmarshal_response_body_failed", http.StatusBadGateway)
	}
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		message := result.Message
		if message == "" {
			message = http.StatusText(resp.StatusCode)
		}
		return nil, service.TaskErrorWrapper(fmt.Errorf("SiliconFlow API error: %s", message), "siliconflow_api_error", resp.StatusCode)
	}
	if strings.TrimSpace(result.RequestID) == "" {
		return nil, service.TaskErrorWrapper(fmt.Errorf("SiliconFlow requestId is empty"), "invalid_response", http.StatusBadGateway)
	}

	video := dto.NewOpenAIVideo()
	video.ID = info.PublicTaskID
	video.TaskID = info.PublicTaskID
	video.Model = info.OriginModelName
	video.CreatedAt = time.Now().Unix()
	return &channel.TaskSubmitResponse{UpstreamTaskID: result.RequestID, TaskData: responseBody, ClientResponse: video}, nil
}

func (a *TaskAdaptor) DoResponse(c *gin.Context, resp *http.Response, info *relaycommon.RelayInfo) (string, []byte, *taskdto.TaskError) {
	parsed, err := a.ParseResponse(c, resp, info)
	if err != nil || parsed == nil {
		return "", nil, err
	}
	if parsed.ClientResponse != nil {
		c.JSON(http.StatusOK, parsed.ClientResponse)
	}
	return parsed.UpstreamTaskID, parsed.TaskData, nil
}

func (a *TaskAdaptor) FetchTask(baseURL, key string, task *model.Task, proxy string) (*http.Response, error) {
	if task == nil || strings.TrimSpace(task.GetUpstreamTaskID()) == "" {
		return nil, fmt.Errorf("invalid task_id")
	}
	taskID := task.GetUpstreamTaskID()
	payload, err := common.Marshal(map[string]string{"requestId": taskID})
	if err != nil {
		return nil, err
	}
	baseURL = strings.TrimSuffix(strings.TrimRight(baseURL, "/"), "/v1")
	req, err := http.NewRequest(http.MethodPost, baseURL+"/v1/video/status", bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+key)

	client, err := service.GetHttpClientWithProxy(proxy)
	if err != nil {
		return nil, fmt.Errorf("new proxy http client failed: %w", err)
	}
	if client == nil {
		client = http.DefaultClient
	}
	return client.Do(req)
}

func (a *TaskAdaptor) ParseTaskResult(_ *model.Task, _ *http.Response, respBody []byte) (*relaycommon.TaskInfo, error) {
	var result statusResponse
	if err := common.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("unmarshal SiliconFlow task result: %w", err)
	}
	taskInfo := &relaycommon.TaskInfo{Code: 0}
	switch result.Status {
	case "InQueue":
		taskInfo.Status = string(model.TaskStatusQueued)
		taskInfo.Progress = taskcommon.ProgressQueued
	case "InProgress":
		taskInfo.Status = string(model.TaskStatusInProgress)
		taskInfo.Progress = taskcommon.ProgressInProgress
	case "Succeed":
		taskInfo.Status = string(model.TaskStatusSuccess)
		taskInfo.Progress = taskcommon.ProgressComplete
		if len(result.Results.Videos) == 0 || strings.TrimSpace(result.Results.Videos[0].URL) == "" {
			return nil, fmt.Errorf("SiliconFlow task succeeded without a video URL")
		}
		taskInfo.Url = result.Results.Videos[0].URL
	case "Failed":
		taskInfo.Status = string(model.TaskStatusFailure)
		taskInfo.Progress = taskcommon.ProgressComplete
		taskInfo.Reason = result.Reason
		if taskInfo.Reason == "" {
			taskInfo.Reason = result.Message
		}
	default:
		if result.Message != "" {
			return nil, fmt.Errorf("SiliconFlow API error: %s", result.Message)
		}
		return nil, fmt.Errorf("unknown SiliconFlow task status: %s", result.Status)
	}
	return taskInfo, nil
}

func (a *TaskAdaptor) ConvertToOpenAIVideo(task *model.Task) ([]byte, error) {
	video := task.ToOpenAIVideo()
	if task.Status == model.TaskStatusFailure {
		video.Error = &dto.OpenAIVideoError{Code: "generation_failed", Message: task.FailReason}
	}
	return common.Marshal(video)
}

func (a *TaskAdaptor) GetModelList() []string {
	return ModelList
}

func (a *TaskAdaptor) GetChannelName() string {
	return ChannelName
}

func buildSubmitRequest(req relaycommon.TaskSubmitReq, modelName string) (*submitRequest, error) {
	if modelName != ModelWan22I2V && modelName != ModelWan22T2V {
		return nil, fmt.Errorf("unsupported SiliconFlow video model: %s", modelName)
	}
	imageSize := req.Size
	if imageSize == "" {
		imageSize = "1280x720"
	}
	switch imageSize {
	case "1280x720", "720x1280", "960x960":
	default:
		return nil, fmt.Errorf("unsupported image_size %q", imageSize)
	}

	image := ""
	if len(req.Images) > 0 {
		image = req.Images[0]
	}
	if modelName == ModelWan22I2V && strings.TrimSpace(image) == "" {
		return nil, fmt.Errorf("model %s requires an input image", modelName)
	}
	if modelName == ModelWan22T2V && image != "" {
		return nil, fmt.Errorf("model %s does not accept an input image", modelName)
	}

	options := struct {
		NegativePrompt string `json:"negative_prompt,omitempty"`
		Seed           *int64 `json:"seed,omitempty"`
	}{}
	if err := req.UnmarshalMetadata(&options); err != nil {
		return nil, err
	}
	return &submitRequest{
		Model:          modelName,
		Prompt:         req.Prompt,
		NegativePrompt: options.NegativePrompt,
		ImageSize:      imageSize,
		Image:          image,
		Seed:           options.Seed,
	}, nil
}
