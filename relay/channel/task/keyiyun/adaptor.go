package keyiyun

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

const requestContextKey = "keyiyun_video_request"

var ModelList = []string{
	"sd_2.0_fast_special",
	"sd_2.0_special",
	"wan3.0-video-c1",
	"happyhorse-1.1-r2v",
}

type responseError struct {
	Code    any    `json:"code,omitempty"`
	Message string `json:"message,omitempty"`
}

type taskResponse struct {
	ID             string         `json:"id,omitempty"`
	Status         string         `json:"status,omitempty"`
	Progress       any            `json:"progress,omitempty"`
	ResultURL      string         `json:"result_url,omitempty"`
	VideoURL       string         `json:"video_url,omitempty"`
	Message        string         `json:"message,omitempty"`
	Error          *responseError `json:"error,omitempty"`
	Amount         float64        `json:"amount,omitempty"`
	ActualDuration float64        `json:"actualDuration,omitempty"`
}

type TaskAdaptor struct {
	taskcommon.BaseBilling
	apiKey  string
	baseURL string
}

var _ channel.TaskAdaptor = (*TaskAdaptor)(nil)
var _ channel.OpenAIVideoConverter = (*TaskAdaptor)(nil)
var _ channel.TaskCompletionBillingAdaptor = (*TaskAdaptor)(nil)

func (a *TaskAdaptor) Init(info *relaycommon.RelayInfo) {
	a.apiKey = info.ApiKey
	a.baseURL = normalizeBaseURL(info.ChannelBaseUrl)
	if a.baseURL == "" {
		a.baseURL = normalizeBaseURL(constant.ChannelBaseURLs[constant.ChannelTypeKeyiyun])
	}
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

func (a *TaskAdaptor) BuildRequestURL(_ *relaycommon.RelayInfo) (string, error) {
	if a.baseURL == "" {
		return "", fmt.Errorf("Keyiyun base URL is empty")
	}
	return a.baseURL + "/v2/model-center/tasks", nil
}

func (a *TaskAdaptor) EstimateBilling(c *gin.Context, info *relaycommon.RelayInfo) map[string]float64 {
	value, ok := c.Get(requestContextKey)
	if !ok {
		return nil
	}
	payload, ok := value.(map[string]any)
	if !ok {
		return nil
	}
	duration, err := requestDuration(payload)
	if err != nil {
		return nil
	}
	if duration == 0 {
		duration = 5
	}
	return map[string]float64{"seconds": float64(duration)}
}

func (a *TaskAdaptor) AdjustBillingOnComplete(task *model.Task, taskResult *relaycommon.TaskInfo) int {
	var result taskResponse
	if err := task.GetData(&result); err != nil || result.ActualDuration <= 0 || task.PrivateData.BillingContext == nil {
		return 0
	}
	billingContext := task.PrivateData.BillingContext
	if billingContext.ModelPrice <= 0 || billingContext.GroupRatio <= 0 {
		return 0
	}
	quota, clamp := common.QuotaFromFloatChecked(result.ActualDuration * billingContext.ModelPrice * common.QuotaPerUnit * billingContext.GroupRatio)
	taskResult.QuotaClamp = clamp
	return quota
}

func (a *TaskAdaptor) SupportsCompletionBillingAdjustment() bool { return true }

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

	if _, exists := payload["reference_images"]; !exists {
		if images, ok := payload["images"]; ok {
			payload["reference_images"] = images
		} else if image, ok := payload["image"]; ok {
			payload["reference_images"] = []any{image}
		}
	}
	if _, exists := payload["reference_videos"]; !exists {
		if videos, ok := payload["videos"]; ok {
			payload["reference_videos"] = videos
		}
	}
	if _, exists := payload["reference_audios"]; !exists {
		if audios, ok := payload["audios"]; ok {
			payload["reference_audios"] = audios
		}
	}
	if _, exists := payload["aspect_ratio"]; !exists {
		if ratio, ok := payload["ratio"]; ok {
			payload["aspect_ratio"] = ratio
		}
	}
	if _, exists := payload["resolution"]; !exists {
		if size, ok := payload["size"]; ok {
			payload["resolution"] = size
		}
	}
	delete(payload, "image")
	delete(payload, "images")
	delete(payload, "videos")
	delete(payload, "audios")
	delete(payload, "ratio")
	delete(payload, "size")
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

func (a *TaskAdaptor) DoResponse(c *gin.Context, resp *http.Response, info *relaycommon.RelayInfo) (string, []byte, *taskdto.TaskError) {
	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", nil, service.TaskErrorWrapper(err, "read_response_body_failed", http.StatusInternalServerError)
	}
	_ = resp.Body.Close()
	var result taskResponse
	if err := common.Unmarshal(responseBody, &result); err != nil {
		return "", responseBody, service.TaskErrorWrapper(fmt.Errorf("unmarshal Keyiyun response: %w", err), "unmarshal_response_body_failed", http.StatusBadGateway)
	}
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return "", responseBody, service.TaskErrorWrapper(fmt.Errorf("Keyiyun API error: %s", responseMessage(result, resp.StatusCode)), "keyiyun_api_error", resp.StatusCode)
	}
	if strings.TrimSpace(result.ID) == "" {
		return "", responseBody, service.TaskErrorWrapper(fmt.Errorf("Keyiyun task id is empty"), "invalid_response", http.StatusBadGateway)
	}

	video := dto.NewOpenAIVideo()
	video.ID = info.PublicTaskID
	video.TaskID = info.PublicTaskID
	video.Model = info.OriginModelName
	video.CreatedAt = time.Now().Unix()
	c.JSON(http.StatusOK, video)
	return result.ID, responseBody, nil
}

func (a *TaskAdaptor) FetchTask(baseURL, key string, body map[string]any, proxy string) (*http.Response, error) {
	taskID, ok := body["task_id"].(string)
	if !ok || strings.TrimSpace(taskID) == "" {
		return nil, fmt.Errorf("invalid task_id")
	}
	endpoint := normalizeBaseURL(baseURL) + "/v2/model-center/tasks/" + url.PathEscape(taskID)
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

func (a *TaskAdaptor) ParseTaskResult(respBody []byte) (*relaycommon.TaskInfo, error) {
	var result taskResponse
	if err := common.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("unmarshal Keyiyun task result: %w", err)
	}
	taskInfo := &relaycommon.TaskInfo{Code: 0, TaskID: result.ID}
	switch strings.ToLower(strings.TrimSpace(result.Status)) {
	case "queued", "pending", "submitted":
		taskInfo.Status = string(model.TaskStatusQueued)
		taskInfo.Progress = taskcommon.ProgressQueued
	case "processing", "running", "in_progress":
		taskInfo.Status = string(model.TaskStatusInProgress)
		taskInfo.Progress = taskcommon.ProgressInProgress
	case "completed", "succeeded", "success", "done":
		taskInfo.Status = string(model.TaskStatusSuccess)
		taskInfo.Progress = taskcommon.ProgressComplete
		taskInfo.Url = result.ResultURL
		if taskInfo.Url == "" {
			taskInfo.Url = result.VideoURL
		}
		if taskInfo.Url == "" {
			return nil, fmt.Errorf("Keyiyun task succeeded without a video URL")
		}
	case "failed", "failure", "cancelled", "canceled", "expired":
		taskInfo.Status = string(model.TaskStatusFailure)
		taskInfo.Progress = taskcommon.ProgressComplete
		taskInfo.Reason = responseMessage(result, http.StatusBadRequest)
	default:
		if result.Error != nil || result.Message != "" {
			return nil, fmt.Errorf("Keyiyun API error: %s", responseMessage(result, http.StatusBadGateway))
		}
		return nil, fmt.Errorf("unknown Keyiyun task status: %s", result.Status)
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

func (a *TaskAdaptor) GetChannelName() string { return "keyiyun-video" }

func normalizeBaseURL(baseURL string) string {
	trimmed := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	return strings.TrimSuffix(trimmed, "/v2/model-center/tasks")
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

func responseMessage(result taskResponse, statusCode int) string {
	if result.Error != nil && strings.TrimSpace(result.Error.Message) != "" {
		return result.Error.Message
	}
	if strings.TrimSpace(result.Message) != "" {
		return result.Message
	}
	return http.StatusText(statusCode)
}
