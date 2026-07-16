package jiekou

type submitRequest struct {
	Fast                  *bool    `json:"fast,omitempty"`
	Seed                  *int64   `json:"seed,omitempty"`
	Image                 string   `json:"image,omitempty"`
	Ratio                 string   `json:"ratio,omitempty"`
	AspectRatio           string   `json:"aspect_ratio,omitempty"`
	Prompt                string   `json:"prompt,omitempty"`
	Duration              int      `json:"duration"`
	Watermark             *bool    `json:"watermark,omitempty"`
	LastImage             string   `json:"last_image,omitempty"`
	Resolution            string   `json:"resolution"`
	CameraFixed           *bool    `json:"camera_fixed,omitempty"`
	ServiceTier           string   `json:"service_tier,omitempty"`
	GenerateAudio         *bool    `json:"generate_audio,omitempty"`
	ExecutionExpiresAfter *int     `json:"execution_expires_after,omitempty"`
	WebSearch             *bool    `json:"web_search,omitempty"`
	ReferenceAudios       []string `json:"reference_audios,omitempty"`
	ReferenceImages       []string `json:"reference_images,omitempty"`
	ReferenceVideos       []string `json:"reference_videos,omitempty"`
	ReturnLastFrame       *bool    `json:"return_last_frame,omitempty"`
}

type submitResponse struct {
	TaskID  string          `json:"task_id"`
	Code    any             `json:"code,omitempty"`
	Message string          `json:"message,omitempty"`
	Error   *jiekouAPIError `json:"error,omitempty"`
}

type jiekouAPIError struct {
	Code    any    `json:"code,omitempty"`
	Message string `json:"message,omitempty"`
}

type taskResultResponse struct {
	Task    taskStatus          `json:"task"`
	Videos  []taskVideo         `json:"videos,omitempty"`
	Images  []taskImage         `json:"images,omitempty"`
	Message string              `json:"message,omitempty"`
	Error   *jiekouAPIError     `json:"error,omitempty"`
	Data    *taskResultResponse `json:"data,omitempty"`
}

type taskStatus struct {
	TaskID          string `json:"task_id"`
	TaskType        string `json:"task_type,omitempty"`
	Status          string `json:"status"`
	Reason          string `json:"reason,omitempty"`
	ProgressPercent int    `json:"progress_percent,omitempty"`
}

type taskVideo struct {
	VideoURL string `json:"video_url"`
	Duration string `json:"duration,omitempty"`
	Type     string `json:"video_type,omitempty"`
}

type taskImage struct {
	ImageURL string `json:"image_url"`
	Type     string `json:"image_type,omitempty"`
}

func (r taskResultResponse) payload() taskResultResponse {
	if r.Data != nil && r.Task.TaskID == "" && r.Task.Status == "" {
		return *r.Data
	}
	return r
}

func (r taskResultResponse) errorMessage() string {
	if r.Error != nil && r.Error.Message != "" {
		return r.Error.Message
	}
	if r.Task.Reason != "" {
		return r.Task.Reason
	}
	return r.Message
}
