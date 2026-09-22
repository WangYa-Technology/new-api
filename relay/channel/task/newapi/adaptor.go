package newapi

import (
	"bytes"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"strconv"
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

const requestContextKey = "newapi_video_request"

var ModelList = []string{
	"MiniMax-H3",
	"MiniMax-H3-Max",
	"kling-3.0-turbo",
	"kling-v3",
	"kling-video-o1",
	"viduq3",
	"viduq3-drama",
	"viduq3-pro",
	"viduq3-turbo",
}

type responseError struct {
	Code    any    `json:"code,omitempty"`
	Message string `json:"message,omitempty"`
}

type videoResponse struct {
	ID        string         `json:"id,omitempty"`
	TaskID    string         `json:"task_id,omitempty"`
	Status    string         `json:"status,omitempty"`
	Progress  any            `json:"progress,omitempty"`
	Message   string         `json:"message,omitempty"`
	Error     *responseError `json:"error,omitempty"`
	URL       string         `json:"url,omitempty"`
	VideoURL  string         `json:"video_url,omitempty"`
	ResultURL string         `json:"result_url,omitempty"`
	Data      []struct {
		URL string `json:"url,omitempty"`
	} `json:"data,omitempty"`
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
	a.baseURL = normalizeBaseURL(info.ChannelBaseUrl)
}

func (a *TaskAdaptor) ValidateRequestAndSetAction(c *gin.Context, info *relaycommon.RelayInfo) *taskdto.TaskError {
	storage, err := common.GetBodyStorage(c)
	if err != nil {
		return service.TaskErrorWrapperLocal(err, "invalid_request", http.StatusBadRequest)
	}
	body, err := storage.Bytes()
	if err != nil {
		return service.TaskErrorWrapperLocal(err, "invalid_request", http.StatusBadRequest)
	}
	var payload map[string]any
	if err := common.Unmarshal(body, &payload); err != nil {
		return service.TaskErrorWrapperLocal(err, "invalid_request", http.StatusBadRequest)
	}
	if metadata, ok := payload["metadata"].(map[string]any); ok {
		for key, value := range metadata {
			if _, exists := payload[key]; !exists && key != "model" {
				payload[key] = value
			}
		}
	}
	delete(payload, "metadata")
	prompt, _ := payload["prompt"].(string)
	if strings.TrimSpace(prompt) == "" {
		return service.TaskErrorWrapperLocal(fmt.Errorf("prompt is required"), "invalid_request", http.StatusBadRequest)
	}
	modelName, _ := payload["model"].(string)
	if strings.TrimSpace(modelName) == "" {
		return service.TaskErrorWrapperLocal(fmt.Errorf("model is required"), "missing_model", http.StatusBadRequest)
	}
	duration, err := requestDuration(payload)
	if err != nil {
		return service.TaskErrorWrapperLocal(err, "invalid_seconds", http.StatusBadRequest)
	}
	if duration < 0 || duration > relaycommon.MaxTaskDurationSeconds {
		return service.TaskErrorWrapperLocal(fmt.Errorf("seconds must be between 1 and %d", relaycommon.MaxTaskDurationSeconds), "invalid_seconds", http.StatusBadRequest)
	}

	if info.TaskRelayInfo == nil {
		info.TaskRelayInfo = &relaycommon.TaskRelayInfo{}
	}
	info.Action = constant.TaskActionGenerate
	c.Set(requestContextKey, payload)
	c.Set("task_request", relaycommon.TaskSubmitReq{Prompt: prompt, Model: modelName, Duration: duration})
	return nil
}

func (a *TaskAdaptor) EstimateBilling(c *gin.Context, info *relaycommon.RelayInfo) map[string]float64 {
	payload, ok := c.Get(requestContextKey)
	if !ok {
		return nil
	}
	requestBody, ok := payload.(map[string]any)
	if !ok {
		return nil
	}
	duration, err := requestDuration(requestBody)
	if err != nil {
		return nil
	}
	if duration == 0 {
		duration = 5
	}
	return map[string]float64{"seconds": float64(duration)}
}

func (a *TaskAdaptor) BuildRequestURL(_ *relaycommon.RelayInfo) (string, error) {
	if a.baseURL == "" {
		return "", fmt.Errorf("New API base URL is empty")
	}
	return a.baseURL + "/v1/video/generations", nil
}

func (a *TaskAdaptor) BuildRequestHeader(_ *gin.Context, req *http.Request, _ *relaycommon.RelayInfo) error {
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+a.apiKey)
	return nil
}

func (a *TaskAdaptor) BuildRequestBody(c *gin.Context, info *relaycommon.RelayInfo) (io.Reader, error) {
	value, ok := c.Get(requestContextKey)
	if !ok {
		return nil, fmt.Errorf("request not found in context")
	}
	payload, ok := value.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("invalid request in context")
	}
	payload["model"] = info.UpstreamModelName
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

	var result videoResponse
	if err := common.Unmarshal(responseBody, &result); err != nil {
		return nil, service.TaskErrorWrapper(fmt.Errorf("unmarshal New API video response: %w", err), "unmarshal_response_body_failed", http.StatusBadGateway)
	}
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return nil, service.TaskErrorWrapper(fmt.Errorf("New API video error: %s", responseMessage(result, resp.StatusCode)), "newapi_video_error", resp.StatusCode)
	}
	taskID := strings.TrimSpace(result.TaskID)
	if taskID == "" {
		taskID = strings.TrimSpace(result.ID)
	}
	if taskID == "" {
		return nil, service.TaskErrorWrapper(fmt.Errorf("New API video task id is empty"), "invalid_response", http.StatusBadGateway)
	}

	video := dto.NewOpenAIVideo()
	video.ID = info.PublicTaskID
	video.TaskID = info.PublicTaskID
	video.Model = info.OriginModelName
	video.CreatedAt = time.Now().Unix()
	return &channel.TaskSubmitResponse{UpstreamTaskID: taskID, TaskData: responseBody, ClientResponse: video}, nil
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
	endpoint := normalizeBaseURL(baseURL) + "/v1/video/generations/" + url.PathEscape(taskID)
	req, err := http.NewRequest(http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
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
	var result videoResponse
	if err := common.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("unmarshal New API video task result: %w", err)
	}
	status := strings.ToLower(strings.TrimSpace(result.Status))
	taskInfo := &relaycommon.TaskInfo{Code: 0, TaskID: firstNonEmpty(result.TaskID, result.ID)}
	switch status {
	case "queued", "pending", "submitted", "created", "not_start":
		taskInfo.Status = string(model.TaskStatusQueued)
		taskInfo.Progress = taskcommon.ProgressQueued
	case "processing", "running", "in_progress":
		taskInfo.Status = string(model.TaskStatusInProgress)
		taskInfo.Progress = taskcommon.ProgressInProgress
	case "completed", "succeeded", "success", "done":
		taskInfo.Status = string(model.TaskStatusSuccess)
		taskInfo.Progress = taskcommon.ProgressComplete
		taskInfo.Url = firstNonEmpty(result.URL, result.VideoURL, result.ResultURL)
		if taskInfo.Url == "" && len(result.Data) > 0 {
			taskInfo.Url = result.Data[0].URL
		}
		if taskInfo.Url == "" {
			return nil, fmt.Errorf("New API video task succeeded without a video URL")
		}
	case "failed", "failure", "cancelled", "canceled", "expired":
		taskInfo.Status = string(model.TaskStatusFailure)
		taskInfo.Progress = taskcommon.ProgressComplete
		taskInfo.Reason = responseMessage(result, http.StatusBadRequest)
	default:
		if result.Error != nil || result.Message != "" {
			return nil, fmt.Errorf("New API video error: %s", responseMessage(result, http.StatusBadGateway))
		}
		return nil, fmt.Errorf("unknown New API video task status: %s", result.Status)
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

func (a *TaskAdaptor) GetModelList() []string { return ModelList }

func (a *TaskAdaptor) GetChannelName() string { return "new-api-video" }

func normalizeBaseURL(baseURL string) string {
	trimmed := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	return strings.TrimSuffix(trimmed, "/v1")
}

func requestDuration(payload map[string]any) (int, error) {
	value, exists := payload["duration"]
	if !exists {
		value, exists = payload["seconds"]
	}
	if !exists || value == nil {
		return 0, nil
	}
	switch typed := value.(type) {
	case float64:
		if typed != math.Trunc(typed) {
			return 0, fmt.Errorf("duration must be an integer")
		}
		if typed < 0 || typed > relaycommon.MaxTaskDurationSeconds {
			return 0, fmt.Errorf("duration must be between 1 and %d", relaycommon.MaxTaskDurationSeconds)
		}
		return int(typed), nil
	case string:
		duration, err := strconv.Atoi(typed)
		if err != nil {
			return 0, fmt.Errorf("duration must be an integer")
		}
		if duration < 0 || duration > relaycommon.MaxTaskDurationSeconds {
			return 0, fmt.Errorf("duration must be between 1 and %d", relaycommon.MaxTaskDurationSeconds)
		}
		return duration, nil
	default:
		return 0, fmt.Errorf("duration must be an integer")
	}
}

func responseMessage(result videoResponse, statusCode int) string {
	if result.Error != nil && strings.TrimSpace(result.Error.Message) != "" {
		return result.Error.Message
	}
	if strings.TrimSpace(result.Message) != "" {
		return result.Message
	}
	return http.StatusText(statusCode)
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}
