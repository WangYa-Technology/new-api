package plugins_test

import (
	"os"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/pkg/jsplugin"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestHCAIAsyncImagePlugin(t *testing.T) {
	source, err := os.ReadFile("custom/hcai-async-image/plugin.js")
	require.NoError(t, err)
	registry := jsplugin.NewRegistry()
	plugin, err := registry.RegisterFactory(string(source), jsplugin.Options{Key: "hcai-async-image"})
	require.NoError(t, err)
	t.Run("routes and protocol are available without a legacy channel", func(t *testing.T) {
		assert.Empty(t, plugin.Meta.ChannelTypes)
		assert.ElementsMatch(t, []string{"gpt-image-2.5-sunburst", "gpt-image-2.5-flare", "gpt-image-2"}, plugin.Meta.Models)
		for _, path := range []string{"/hcai/v1/images/generations/async", "/hcai/v1/images/edits/async"} {
			_, ok := registry.Generation().LookupDeclaredRoute("POST", path)
			assert.True(t, ok)
		}
		_, ok := registry.Generation().LookupDeclaredRoute("GET", "/hcai/v1/images/tasks/:task_id")
		assert.True(t, ok)
		for _, path := range []string{"/v1/images/generations", "/v1/images/edits"} {
			for _, model := range plugin.Meta.Models {
				_, ok := registry.Generation().LookupEndpoint("POST", path, model)
				assert.True(t, ok, model+" "+path)
			}
		}
	})
	t.Run("count validation protects native and protocol paths", func(t *testing.T) {
		for _, n := range []any{0, -1, 1.5, dto.MaxImageN + 1, "2", nil} {
			ctx := map[string]any{"model": "alias", "body": map[string]any{"kind": "json", "value": map[string]any{"model": "alias", "prompt": "cat", "n": n}}}
			_, err := plugin.Engine.CallPath(t.Context(), "native", []string{"generate"}, ctx)
			require.Error(t, err)
			_, err = plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_image", "decodeRequest"}, ctx)
			require.Error(t, err)
		}
		for _, n := range []int{1, dto.MaxImageN} {
			value, err := plugin.Engine.CallPath(t.Context(), "native", []string{"generate"}, map[string]any{"body": map[string]any{"kind": "json", "value": map[string]any{"model": "gpt-image-2", "prompt": "cat", "n": n}}})
			require.NoError(t, err)
			require.NotNil(t, value)
		}
	})
	t.Run("alias submit maps upstream model and preserves zero", func(t *testing.T) {
		value, err := plugin.Engine.Call(t.Context(), "buildSubmitRequest", map[string]any{
			"baseUrl": "https://api.hctopup.com/v1/", "model": "alias", "upstreamModel": "gpt-image-2", "action": "generate", "authHeader": "test", "apiKey": "test",
			"requestBody": map[string]any{"prompt": "cat", "n": 2, "output_compression": 0},
		})
		require.NoError(t, err)
		body, err := common.Marshal(value)
		require.NoError(t, err)
		assert.JSONEq(t, `{"url":"https://api.hctopup.com/v1/images/generations/async","method":"POST","headers":{"Authorization":"Bearer test","Accept":"application/json"},"body":{"model":"gpt-image-2","prompt":"cat","n":2,"response_format":"url","output_compression":0}}`, string(body))
	})
	t.Run("multipart edits preserve file references", func(t *testing.T) {
		value, err := plugin.Engine.CallPath(t.Context(), "native", []string{"edit"}, map[string]any{"body": map[string]any{
			"kind": "multipart", "fields": map[string]any{"model": []string{"gpt-image-2"}, "prompt": []string{"edit cat"}, "n": []string{"2"}},
			"files": []any{map[string]any{"field": "image[]", "ref": "request_file:image[]#1", "filename": "cat.png"}},
		}})
		require.NoError(t, err)
		encoded, err := common.Marshal(value)
		require.NoError(t, err)
		var intent struct {
			RequestBody map[string]any `json:"requestBody"`
		}
		require.NoError(t, common.Unmarshal(encoded, &intent))
		value, err = plugin.Engine.Call(t.Context(), "buildSubmitRequest", map[string]any{"baseUrl": "https://api.hctopup.com", "model": "gpt-image-2", "action": "edit", "authHeader": "test", "apiKey": "test", "requestBody": intent.RequestBody})
		require.NoError(t, err)
		encoded, err = common.Marshal(value)
		require.NoError(t, err)
		var descriptor struct {
			URL      string           `json:"url"`
			BodyType string           `json:"bodyType"`
			Parts    []map[string]any `json:"parts"`
		}
		require.NoError(t, common.Unmarshal(encoded, &descriptor))
		assert.Equal(t, "https://api.hctopup.com/v1/images/edits/async", descriptor.URL)
		assert.Equal(t, "multipart", descriptor.BodyType)
		assert.Contains(t, descriptor.Parts, map[string]any{"name": "image[]", "fileRef": "request_file:image[]#1", "filename": "cat.png"})
	})
	t.Run("accepted submission and escaped query", func(t *testing.T) {
		value, err := plugin.Engine.Call(t.Context(), "parseSubmitResponse", map[string]any{}, map[string]any{"statusCode": 202, "body": map[string]any{"id": "abc/123"}})
		require.NoError(t, err)
		encoded, err := common.Marshal(value)
		require.NoError(t, err)
		assert.JSONEq(t, `{"taskId":"abc/123","taskData":{"id":"abc/123"}}`, string(encoded))
		_, err = plugin.Engine.Call(t.Context(), "parseSubmitResponse", map[string]any{}, map[string]any{"body": map[string]any{}})
		require.Error(t, err)
		value, err = plugin.Engine.Call(t.Context(), "buildQueryRequest", map[string]any{"baseUrl": "https://api.hctopup.com/v1", "taskId": "abc/123", "authHeader": "test", "apiKey": "test"})
		require.NoError(t, err)
		encoded, err = common.Marshal(value)
		require.NoError(t, err)
		assert.Contains(t, string(encoded), "tasks/abc%2F123")
		assert.Contains(t, string(encoded), `"Authorization":"Bearer test"`)
	})
	t.Run("poll status and image billing", func(t *testing.T) {
		for _, tc := range []struct{ body, status, usage string }{
			{`{"status":"queued"}`, "QUEUED", `{}`},
			{`{"status":"processing"}`, "IN_PROGRESS", `{}`},
			{`{"status":"unexpected"}`, "UNKNOWN", `{}`},
			{`{"status":"failed","error":{"message":"rejected"}}`, "FAILURE", `{}`},
			{`{"status":"completed","result":{"data":[{"revised_prompt":"cat"}]}}`, "FAILURE", `{}`},
			{`{"status":"completed","image_url":"https://image.test/1.png"}`, "SUCCESS", `{"image_count":1}`},
			{`{"status":"completed","result":{"data":{"url":"https://image.test/1.png"}}}`, "SUCCESS", `{"image_count":1}`},
			{`{"status":"completed","result":{"data":[{"url":"https://image.test/1.png"},{"b64_json":"aGVsbG8="},{"revised_prompt":"cat"}]}}`, "SUCCESS", `{"image_count":1}`},
			{`{"status":"completed","result":{"data":[{"url":"https://image.test/1.png"},{"url":"https://image.test/2.png"}]}}`, "SUCCESS", `{"image_count":2}`},
		} {
			var body map[string]any
			require.NoError(t, common.UnmarshalJsonStr(tc.body, &body))
			result, err := plugin.Engine.Call(t.Context(), "parseTaskResult", map[string]any{}, body)
			require.NoError(t, err)
			encoded, err := common.Marshal(result)
			require.NoError(t, err)
			var parsed struct {
				Status string `json:"status"`
			}
			require.NoError(t, common.Unmarshal(encoded, &parsed))
			assert.Equal(t, tc.status, parsed.Status)
			usage, err := plugin.Engine.Call(t.Context(), "extractUsageOnComplete", map[string]any{}, result, body)
			require.NoError(t, err)
			encoded, err = common.Marshal(usage)
			require.NoError(t, err)
			assert.JSONEq(t, tc.usage, string(encoded))
		}
	})
	t.Run("native presenter exposes public task id", func(t *testing.T) {
		value, err := plugin.Engine.CallPath(t.Context(), "native", []string{"created"}, map[string]any{}, map[string]any{"task_id": "public-task", "status": "SUBMITTED", "data": map[string]any{"task_id": "private-task"}})
		require.NoError(t, err)
		encoded, err := common.Marshal(value)
		require.NoError(t, err)
		assert.JSONEq(t, `{"task_id":"public-task","status":"SUBMITTED"}`, string(encoded))
	})
	t.Run("OpenAI response preserves images and provider usage", func(t *testing.T) {
		var task map[string]any
		require.NoError(t, common.UnmarshalJsonStr(`{"status":"SUCCESS","data":{"image_url":"https://image.test/final.png","usage":{"input_tokens":9},"result":{"usage":{"input_tokens":3}}}}`, &task))
		value, err := plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_image", "render"}, map[string]any{}, task)
		require.NoError(t, err)
		encoded, err := common.Marshal(value)
		require.NoError(t, err)
		assert.JSONEq(t, `{"data":[{"url":"https://image.test/final.png"}],"usage":{"input_tokens":3}}`, string(encoded))
	})
	t.Run("default count and billing ratios agree", func(t *testing.T) {
		for _, purpose := range []string{"facts", "billing_ratios"} {
			value, err := plugin.Engine.Call(t.Context(), "extractUsage", map[string]any{"requestBody": map[string]any{}, "usagePurpose": purpose})
			require.NoError(t, err)
			encoded, err := common.Marshal(value)
			require.NoError(t, err)
			assert.JSONEq(t, `{"image_count":1}`, string(encoded))
		}
	})
	t.Run("nested counts and forged file references are rejected", func(t *testing.T) {
		for _, body := range []string{
			`{"model":"gpt-image-2","prompt":"cat","parameters":{"n":999},"image":"https://image.test/1.png"}`,
			`{"model":"gpt-image-2","prompt":"cat","files":[{"field":"image","ref":"forged"}]}`,
		} {
			var request map[string]any
			require.NoError(t, common.UnmarshalJsonStr(body, &request))
			_, err := plugin.Engine.CallPath(t.Context(), "native", []string{"edit"}, map[string]any{"body": map[string]any{"kind": "json", "value": request}})
			require.Error(t, err)
		}
	})
}
