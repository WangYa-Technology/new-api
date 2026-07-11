package xai

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"strings"

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

type imageInput struct {
	URL string `json:"url"`
}

type submitRequest struct {
	Model       string `json:"model"`
	Prompt      string `json:"prompt"`
	Duration    int    `json:"duration,omitempty"`
	AspectRatio string `json:"aspect_ratio,omitempty"`
	Resolution  string `json:"resolution,omitempty"`
	Image       any    `json:"image,omitempty"`
}

type submitResponse struct {
	RequestID string `json:"request_id"`
}

type taskResponse struct {
	Status   string `json:"status"`
	Model    string `json:"model,omitempty"`
	Progress int    `json:"progress,omitempty"`
	Video    *struct {
		URL      string `json:"url"`
		Duration int    `json:"duration,omitempty"`
	} `json:"video,omitempty"`
	Error any `json:"error,omitempty"`
}

type TaskAdaptor struct {
	taskcommon.BaseBilling
	apiKey  string
	baseURL string
}

func (a *TaskAdaptor) Init(info *relaycommon.RelayInfo) {
	a.apiKey = info.ApiKey
	a.baseURL = info.ChannelBaseUrl
}

func (a *TaskAdaptor) ValidateRequestAndSetAction(c *gin.Context, info *relaycommon.RelayInfo) *dto.TaskError {
	var request submitRequest
	if err := common.UnmarshalBodyReusable(c, &request); err != nil {
		return service.TaskErrorWrapperLocal(err, "invalid_request", http.StatusBadRequest)
	}
	if strings.TrimSpace(request.Model) == "" {
		return service.TaskErrorWrapperLocal(errors.New("model field is required"), "missing_model", http.StatusBadRequest)
	}
	if strings.TrimSpace(request.Prompt) == "" {
		return service.TaskErrorWrapperLocal(errors.New("prompt field is required"), "invalid_request", http.StatusBadRequest)
	}

	info.Action = constant.TaskActionTextGenerate
	imageURL, err := getImageURL(request.Image)
	if err != nil {
		return service.TaskErrorWrapperLocal(err, "invalid_image", http.StatusBadRequest)
	}
	if imageURL != "" {
		info.Action = constant.TaskActionGenerate
	}
	return nil
}

func (a *TaskAdaptor) BuildRequestURL(_ *relaycommon.RelayInfo) (string, error) {
	return strings.TrimRight(a.baseURL, "/") + "/v1/videos/generations", nil
}

func (a *TaskAdaptor) BuildRequestHeader(c *gin.Context, req *http.Request, _ *relaycommon.RelayInfo) error {
	req.Header.Set("Authorization", "Bearer "+a.apiKey)
	req.Header.Set("Content-Type", "application/json")
	if accept := c.GetHeader("Accept"); accept != "" {
		req.Header.Set("Accept", accept)
	}
	return nil
}

func (a *TaskAdaptor) BuildRequestBody(c *gin.Context, info *relaycommon.RelayInfo) (io.Reader, error) {
	storage, err := common.GetBodyStorage(c)
	if err != nil {
		return nil, errors.Wrap(err, "get request body failed")
	}
	body, err := storage.Bytes()
	if err != nil {
		return nil, errors.Wrap(err, "read request body failed")
	}

	var payload map[string]any
	if err := common.Unmarshal(body, &payload); err != nil {
		return nil, errors.Wrap(err, "unmarshal request body failed")
	}
	payload["model"] = info.UpstreamModelName

	imageURL, err := getImageURL(payload["image"])
	if err != nil {
		return nil, err
	}
	if imageURL == "" {
		for _, alias := range []string{"image_url", "input_reference"} {
			imageURL, err = getImageURL(payload[alias])
			if err != nil {
				return nil, err
			}
			if imageURL != "" {
				break
			}
		}
	}
	if imageURL == "" {
		if images, ok := payload["images"].([]any); ok && len(images) > 0 {
			imageURL, err = getImageURL(images[0])
			if err != nil {
				return nil, err
			}
		}
	}
	if imageURL != "" {
		payload["image"] = imageInput{URL: imageURL}
	} else {
		delete(payload, "image")
	}
	delete(payload, "image_url")
	delete(payload, "input_reference")
	delete(payload, "images")

	converted, err := common.Marshal(payload)
	if err != nil {
		return nil, errors.Wrap(err, "marshal request body failed")
	}
	info.UpstreamRequestBodySize = int64(len(converted))
	return bytes.NewReader(converted), nil
}

func getImageURL(value any) (string, error) {
	switch image := value.(type) {
	case nil:
		return "", nil
	case string:
		return strings.TrimSpace(image), nil
	case map[string]any:
		urlValue, ok := image["url"]
		if !ok {
			return "", errors.New("image.url is required")
		}
		urlString, ok := urlValue.(string)
		if !ok || strings.TrimSpace(urlString) == "" {
			return "", errors.New("image.url must be a non-empty string")
		}
		return strings.TrimSpace(urlString), nil
	default:
		return "", fmt.Errorf("image must be a URL string or object, got %T", value)
	}
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

	var upstream submitResponse
	if err := common.Unmarshal(responseBody, &upstream); err != nil {
		return "", nil, service.TaskErrorWrapper(errors.Wrapf(err, "body: %s", responseBody), "unmarshal_response_body_failed", http.StatusInternalServerError)
	}
	if strings.TrimSpace(upstream.RequestID) == "" {
		return "", nil, service.TaskErrorWrapper(errors.New("request_id is empty"), "invalid_response", http.StatusInternalServerError)
	}

	c.JSON(http.StatusOK, submitResponse{RequestID: info.PublicTaskID})
	return upstream.RequestID, responseBody, nil
}

func (a *TaskAdaptor) FetchTask(baseURL, key string, body map[string]any, proxy string) (*http.Response, error) {
	taskID, ok := body["task_id"].(string)
	if !ok || strings.TrimSpace(taskID) == "" {
		return nil, errors.New("invalid task_id")
	}

	request, err := http.NewRequest(http.MethodGet, strings.TrimRight(baseURL, "/")+"/v1/videos/"+taskID, nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Authorization", "Bearer "+key)

	client, err := service.GetHttpClientWithProxy(proxy)
	if err != nil {
		return nil, fmt.Errorf("new proxy http client failed: %w", err)
	}
	return client.Do(request)
}

func (a *TaskAdaptor) ParseTaskResult(respBody []byte) (*relaycommon.TaskInfo, error) {
	var response taskResponse
	if err := common.Unmarshal(respBody, &response); err != nil {
		return nil, errors.Wrap(err, "unmarshal task result failed")
	}

	result := &relaycommon.TaskInfo{Code: 0}
	switch strings.ToLower(response.Status) {
	case "queued", "pending":
		result.Status = model.TaskStatusQueued
	case "processing", "in_progress":
		result.Status = model.TaskStatusInProgress
	case "done", "completed":
		result.Status = model.TaskStatusSuccess
		if response.Video != nil {
			result.Url = response.Video.URL
		}
	case "failed", "cancelled", "canceled":
		result.Status = model.TaskStatusFailure
		result.Reason = formatTaskError(response.Error)
	}
	if response.Progress > 0 {
		result.Progress = fmt.Sprintf("%d%%", response.Progress)
	}
	return result, nil
}

func formatTaskError(value any) string {
	if value == nil {
		return "task failed"
	}
	if message, ok := value.(string); ok && strings.TrimSpace(message) != "" {
		return message
	}
	if object, ok := value.(map[string]any); ok {
		if message, ok := object["message"].(string); ok && strings.TrimSpace(message) != "" {
			return message
		}
	}
	data, err := common.Marshal(value)
	if err != nil {
		return "task failed"
	}
	return string(data)
}

func (a *TaskAdaptor) GetModelList() []string {
	return []string{"grok-imagine-video", "grok-imagine-video-1.5-preview"}
}

func (a *TaskAdaptor) GetChannelName() string {
	return "xai-video"
}

func (a *TaskAdaptor) ConvertToOpenAIVideo(task *model.Task) ([]byte, error) {
	if len(task.Data) == 0 {
		return common.Marshal(taskResponse{
			Status:   strings.ToLower(string(task.Status)),
			Progress: common.String2Int(strings.TrimSuffix(task.Progress, "%")),
		})
	}
	var response map[string]any
	if err := common.Unmarshal(task.Data, &response); err != nil {
		return nil, err
	}
	if _, ok := response["request_id"]; ok {
		response["request_id"] = task.TaskID
	}
	return common.Marshal(response)
}
