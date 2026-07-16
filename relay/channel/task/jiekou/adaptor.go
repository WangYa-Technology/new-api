package jiekou

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relay/channel"
	taskcommon "github.com/QuantumNous/new-api/relay/channel/task/taskcommon"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/pkg/errors"
)

type TaskAdaptor struct {
	taskcommon.BaseBilling
	apiKey  string
	baseURL string
}

var _ channel.TaskAdaptor = (*TaskAdaptor)(nil)

func (a *TaskAdaptor) Init(info *relaycommon.RelayInfo) {
	a.apiKey = info.ApiKey
	a.baseURL = normalizeBaseURL(info.ChannelBaseUrl)
	if a.baseURL == "" {
		a.baseURL = constant.ChannelBaseURLs[constant.ChannelTypeJiekouSeedance]
	}
}

func (a *TaskAdaptor) ValidateRequestAndSetAction(c *gin.Context, info *relaycommon.RelayInfo) *dto.TaskError {
	return relaycommon.ValidateBasicTaskRequest(c, info, constant.TaskActionGenerate)
}

func (a *TaskAdaptor) EstimateBilling(c *gin.Context, info *relaycommon.RelayInfo) map[string]float64 {
	req, err := relaycommon.GetTaskRequest(c)
	if err != nil {
		return nil
	}
	payload, err := buildSubmitRequest(&req, info.UpstreamModelName)
	if err != nil {
		return nil
	}

	resolutionRatio := 1.0
	switch payload.Resolution {
	case "480p":
		resolutionRatio = 0.5
	case "1080p":
		resolutionRatio = 2.5
	}
	ratios := map[string]float64{
		"seconds":    float64(payload.Duration),
		"resolution": resolutionRatio,
	}
	if payload.ServiceTier == "flex" {
		ratios["service_tier"] = 0.5
	}
	return ratios
}

func (a *TaskAdaptor) BuildRequestURL(info *relaycommon.RelayInfo) (string, error) {
	config, ok := modelConfigs[info.UpstreamModelName]
	if !ok {
		return "", fmt.Errorf("unsupported Jiekou Seedance model: %s", info.UpstreamModelName)
	}
	return fmt.Sprintf("%s/v3/async/%s", a.baseURL, config.upstreamModel), nil
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
	payload, err := buildSubmitRequest(&req, info.UpstreamModelName)
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

func (a *TaskAdaptor) DoResponse(c *gin.Context, resp *http.Response, info *relaycommon.RelayInfo) (string, []byte, *dto.TaskError) {
	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", nil, service.TaskErrorWrapper(err, "read_response_body_failed", http.StatusInternalServerError)
	}
	_ = resp.Body.Close()

	var result submitResponse
	if err := common.Unmarshal(responseBody, &result); err != nil {
		return "", responseBody, service.TaskErrorWrapper(errors.Wrapf(err, "body: %s", responseBody), "unmarshal_response_body_failed", http.StatusInternalServerError)
	}
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		message := result.Message
		if result.Error != nil && result.Error.Message != "" {
			message = result.Error.Message
		}
		if message == "" {
			message = http.StatusText(resp.StatusCode)
		}
		return "", responseBody, service.TaskErrorWrapper(fmt.Errorf("Jiekou Seedance API error: %s", message), "jiekou_api_error", resp.StatusCode)
	}
	if result.TaskID == "" {
		return "", responseBody, service.TaskErrorWrapper(errors.New("Jiekou Seedance task_id is empty"), "invalid_response", http.StatusBadGateway)
	}

	video := dto.NewOpenAIVideo()
	video.ID = info.PublicTaskID
	video.TaskID = info.PublicTaskID
	video.CreatedAt = time.Now().Unix()
	video.Model = info.OriginModelName
	c.JSON(http.StatusOK, video)
	return result.TaskID, responseBody, nil
}

func (a *TaskAdaptor) FetchTask(baseURL, key string, body map[string]any, proxy string) (*http.Response, error) {
	taskID, ok := body["task_id"].(string)
	if !ok || strings.TrimSpace(taskID) == "" {
		return nil, errors.New("invalid task_id")
	}
	endpoint := normalizeBaseURL(baseURL) + taskResultEndpoint + "?task_id=" + url.QueryEscape(taskID)
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
	var raw taskResultResponse
	if err := common.Unmarshal(respBody, &raw); err != nil {
		return nil, errors.Wrap(err, "unmarshal Jiekou Seedance task result failed")
	}
	result := raw.payload()
	status := strings.ToUpper(strings.TrimSpace(result.Task.Status))
	taskInfo := &relaycommon.TaskInfo{Code: 0, TaskID: result.Task.TaskID}
	if status == "" {
		message := result.errorMessage()
		if message == "" {
			return nil, errors.New("Jiekou Seedance task result status is empty")
		}
		taskInfo.Status = string(model.TaskStatusFailure)
		taskInfo.Progress = "100%"
		taskInfo.Reason = message
		return taskInfo, nil
	}

	switch {
	case strings.Contains(status, "SUCCEED"), strings.Contains(status, "SUCCESS"), status == "DONE":
		taskInfo.Status = string(model.TaskStatusSuccess)
		taskInfo.Progress = "100%"
		if len(result.Videos) > 0 {
			taskInfo.Url = result.Videos[0].VideoURL
		}
	case strings.Contains(status, "FAIL"), strings.Contains(status, "CANCEL"), strings.Contains(status, "EXPIRE"):
		taskInfo.Status = string(model.TaskStatusFailure)
		taskInfo.Progress = "100%"
		taskInfo.Reason = result.errorMessage()
	case strings.Contains(status, "QUEUE"), strings.Contains(status, "PENDING"), strings.Contains(status, "NOT_START"):
		taskInfo.Status = string(model.TaskStatusQueued)
		taskInfo.Progress = progressString(result.Task.ProgressPercent, 10)
	default:
		taskInfo.Status = string(model.TaskStatusInProgress)
		taskInfo.Progress = progressString(result.Task.ProgressPercent, 30)
	}
	if taskInfo.Status == string(model.TaskStatusSuccess) && taskInfo.Url == "" {
		return nil, errors.New("Jiekou Seedance task succeeded without a video URL")
	}
	return taskInfo, nil
}

func (a *TaskAdaptor) ConvertToOpenAIVideo(originTask *model.Task) ([]byte, error) {
	video := originTask.ToOpenAIVideo()
	if originTask.Status == model.TaskStatusFailure {
		video.Error = &dto.OpenAIVideoError{Code: "generation_failed", Message: originTask.FailReason}
	}
	return common.Marshal(video)
}

func (a *TaskAdaptor) GetModelList() []string {
	return ModelList
}

func (a *TaskAdaptor) GetChannelName() string {
	return ChannelName
}

func buildSubmitRequest(req *relaycommon.TaskSubmitReq, modelName string) (*submitRequest, error) {
	config, ok := modelConfigs[modelName]
	if !ok {
		return nil, fmt.Errorf("unsupported Jiekou Seedance model: %s", modelName)
	}

	duration := req.Duration
	if duration == 0 {
		duration, _ = strconv.Atoi(req.Seconds)
	}
	if duration == 0 {
		duration = defaultDuration
	}
	resolution, inferredRatio := normalizeSize(req.Size)
	payload := &submitRequest{
		Prompt:     req.Prompt,
		Duration:   duration,
		Resolution: resolution,
	}
	if config.usesAspectRatio {
		payload.AspectRatio = defaultAspectRatio
		if inferredRatio != "" {
			payload.AspectRatio = inferredRatio
		}
	} else {
		payload.Ratio = defaultAspectRatio
		if modelName == ModelSeedance20 || modelName == ModelSeedance20Fast {
			payload.Ratio = defaultAdaptiveRatio
		}
		if inferredRatio != "" {
			payload.Ratio = inferredRatio
		}
	}
	if len(req.Images) > 0 {
		payload.Image = req.Images[0]
	}
	if err := req.UnmarshalMetadata(payload); err != nil {
		return nil, err
	}

	// Model selection controls the upstream SKU and cannot be overridden through metadata.
	payload.Fast = nil
	if modelName == ModelSeedance20 || modelName == ModelSeedance20Fast {
		payload.Fast = common.GetPointer(config.fast)
	}
	payload.Prompt = req.Prompt
	if config.usesAspectRatio {
		payload.Ratio = ""
		if payload.AspectRatio == "" {
			payload.AspectRatio = defaultAspectRatio
		}
	} else {
		payload.AspectRatio = ""
		if payload.Ratio == "" {
			payload.Ratio = defaultAspectRatio
		}
	}
	if payload.Resolution == "" {
		payload.Resolution = defaultResolution
	}
	if config.imageRequired && payload.Image == "" {
		return nil, fmt.Errorf("model %s requires an input image", modelName)
	}
	if !config.imageAllowed && payload.Image != "" {
		return nil, fmt.Errorf("model %s does not accept an input image", modelName)
	}
	if payload.ServiceTier != "" {
		if !config.supportsServiceTier {
			return nil, fmt.Errorf("model %s does not support service_tier", modelName)
		}
		if payload.ServiceTier != "default" && payload.ServiceTier != "flex" {
			return nil, fmt.Errorf("model %s service_tier must be default or flex", modelName)
		}
	}
	if config.allowedDurations != nil {
		if _, ok := config.allowedDurations[payload.Duration]; !ok {
			return nil, fmt.Errorf("model %s supports duration 5 or 10 seconds", modelName)
		}
	} else if payload.Duration < config.minDuration || payload.Duration > config.maxDuration {
		return nil, fmt.Errorf("model %s duration must be between %d and %d seconds", modelName, config.minDuration, config.maxDuration)
	}
	if _, ok := config.allowedResolution[strings.ToLower(payload.Resolution)]; !ok {
		return nil, fmt.Errorf("model %s does not support resolution %s", modelName, payload.Resolution)
	}
	payload.Resolution = strings.ToLower(payload.Resolution)
	return payload, nil
}

func normalizeBaseURL(baseURL string) string {
	trimmed := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	return strings.TrimSuffix(trimmed, "/openai")
}

func normalizeSize(size string) (string, string) {
	normalized := strings.ToLower(strings.TrimSpace(size))
	resolution := defaultResolution
	switch {
	case strings.Contains(normalized, "1080"):
		resolution = "1080p"
	case strings.Contains(normalized, "480"):
		resolution = "480p"
	case strings.Contains(normalized, "720"):
		resolution = "720p"
	case normalized == "":
		resolution = defaultResolution
	}

	ratio := ""
	switch normalized {
	case "1280x720", "1920x1080", "854x480":
		ratio = "16:9"
	case "720x1280", "1080x1920", "480x854":
		ratio = "9:16"
	case "1024x1024", "720x720", "480x480", "1:1":
		ratio = "1:1"
	}
	return resolution, ratio
}

func progressString(progress, fallback int) string {
	if progress <= 0 {
		progress = fallback
	}
	if progress > 100 {
		progress = 100
	}
	return strconv.Itoa(progress) + "%"
}
