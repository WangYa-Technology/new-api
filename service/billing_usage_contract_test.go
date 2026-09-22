package service

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBillingUsageSelectionContract(t *testing.T) {
	for _, tc := range []struct {
		name     string
		billing  *dto.BillingUsage
		semantic string
		prompt   int
		path     string
	}{
		{"no billing payload", nil, "", 99, "upstream"},
		{"missing protocol payload", &dto.BillingUsage{Source: "oai_chat"}, "", 99, "upstream"},
		{"unknown source", &dto.BillingUsage{Source: "unknown", OpenAIUsage: &dto.Usage{PromptTokens: 11}}, "", 99, "upstream"},
		{"chat source case and whitespace", &dto.BillingUsage{Source: " OAI_CHAT ", OpenAIUsage: &dto.Usage{PromptTokens: 11}}, "openai", 11, "billing-usage-openai"},
		{"responses source", &dto.BillingUsage{Source: "oai_responses", OpenAIUsage: &dto.Usage{InputTokens: 12}}, "openai", 12, "billing-usage-openai"},
		{"semantic fallback", &dto.BillingUsage{Source: "vendor", Semantic: " OPENAI ", OpenAIUsage: &dto.Usage{PromptTokens: 13}}, "openai", 13, "billing-usage-openai"},
		{"claude source", &dto.BillingUsage{Source: " CLAUDE_MESSAGES ", ClaudeUsage: &dto.ClaudeUsage{InputTokens: 21}}, "anthropic", 21, "billing-usage-anthropic"},
		{"claude semantic", &dto.BillingUsage{Semantic: " ANTHROPIC ", ClaudeUsage: &dto.ClaudeUsage{InputTokens: 22}}, "anthropic", 22, "billing-usage-anthropic"},
		{"gemini source", &dto.BillingUsage{Source: " GEMINI_CHAT ", GeminiUsageMetadata: &dto.GeminiUsageMetadata{PromptTokenCount: 31}}, "gemini", 31, "billing-usage-gemini"},
		{"gemini semantic", &dto.BillingUsage{Semantic: " GEMINI ", GeminiUsageMetadata: &dto.GeminiUsageMetadata{PromptTokenCount: 32}}, "gemini", 32, "billing-usage-gemini"},
		{"openai wins conflicting metadata", &dto.BillingUsage{Source: "claude_messages", Semantic: "openai", OpenAIUsage: &dto.Usage{PromptTokens: 11}, ClaudeUsage: &dto.ClaudeUsage{InputTokens: 21}}, "openai", 11, "billing-usage-openai"},
		{"claude wins conflicting metadata", &dto.BillingUsage{Source: "gemini_chat", Semantic: "anthropic", ClaudeUsage: &dto.ClaudeUsage{InputTokens: 21}, GeminiUsageMetadata: &dto.GeminiUsageMetadata{PromptTokenCount: 31}}, "anthropic", 21, "billing-usage-anthropic"},
		{"missing preferred payload falls through", &dto.BillingUsage{Source: "oai_chat", Semantic: "gemini", GeminiUsageMetadata: &dto.GeminiUsageMetadata{PromptTokenCount: 31}}, "gemini", 31, "billing-usage-gemini"},
		{"explicit zero payload falls back to top-level usage", &dto.BillingUsage{Source: "oai_chat", OpenAIUsage: &dto.Usage{}}, "", 99, "upstream"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			for _, estimated := range []bool{false, true} {
				billing := dto.CloneBillingUsage(tc.billing)
				if billing != nil {
					billing.Estimated = estimated
				}
				usage := &dto.Usage{PromptTokens: 99, BillingUsage: billing}
				before, err := common.Marshal(usage)
				require.NoError(t, err)
				effective := effectiveBillingUsage(usage)
				require.NotNil(t, effective)
				assert.Equal(t, tc.semantic, effective.UsageSemantic)
				assert.Equal(t, tc.prompt, effective.PromptTokens)
				for _, local := range []bool{false, true} {
					wantPath := tc.path
					if tc.semantic == "" && local {
						wantPath = "local"
					} else if tc.semantic != "" && estimated {
						wantPath += "-estimated"
					}
					other := model.NewLogOther()
					appendUsageBillingPathForLog(other, local, usage)
					snapshot := other.Snapshot()
					admin, ok := snapshot["admin_info"].(map[string]interface{})
					require.True(t, ok)
					assert.Equal(t, wantPath, admin["usage_billing_path"])
				}
				after, err := common.Marshal(usage)
				require.NoError(t, err)
				assert.JSONEq(t, string(before), string(after), "billing and audit must not mutate upstream usage")
			}
		})
	}
	assert.Nil(t, effectiveBillingUsage(nil))
	assert.Equal(t, "local", usageBillingPathForLog(true, nil))
	assert.Equal(t, "upstream", usageBillingPathForLog(false, nil))
}

func TestBillingAuditFieldsPreserveLogContract(t *testing.T) {
	clamp := &common.QuotaClamp{Op: "QuotaRound", Kind: common.QuotaClampOverflow, Original: 3e9, Clamped: common.MaxQuota}
	for _, tc := range []struct {
		name  string
		admin interface{}
	}{
		{"absent", nil},
		{"typed nil", map[string]interface{}(nil)},
		{"invalid legacy value", "legacy"},
		{"existing fields", map[string]interface{}{"use_channel": []string{"7"}}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			other := model.NewLogOther()
			other.SetPublic("request_path", "/v1/messages")
			if previous, ok := tc.admin.(map[string]interface{}); ok && previous != nil {
				for key, value := range previous {
					other.SetAdmin(key, value)
				}
			}
			attachQuotaSaturationToOther(other, clamp)
			appendUsageBillingPathForLog(other, true, nil)
			snapshot := other.Snapshot()
			admin, ok := snapshot["admin_info"].(map[string]interface{})
			require.True(t, ok)
			assert.Equal(t, clamp.AuditMap(), admin["quota_saturation"])
			assert.Equal(t, "local", admin["usage_billing_path"])
			assert.Equal(t, "/v1/messages", snapshot["request_path"])
			assert.NotContains(t, snapshot, "quota_saturation")
			assert.NotContains(t, snapshot, "usage_billing_path")
			if previous, ok := tc.admin.(map[string]interface{}); ok && previous != nil {
				assert.Equal(t, []string{"7"}, admin["use_channel"])
			}
		})
	}
	assert.NotPanics(t, func() {
		appendUsageBillingPathForLog(nil, false, nil)
		attachQuotaSaturationToOther(nil, clamp)
	})
	other := model.NewLogOther()
	attachQuotaSaturationToOther(other, nil)
	assert.Empty(t, other.Snapshot())
}

func BenchmarkUsageBillingPathForLog(b *testing.B) {
	usage := &dto.Usage{BillingUsage: dto.NewGeminiChatBillingUsage(&dto.GeminiUsageMetadata{
		PromptTokenCount: 100, CandidatesTokenCount: 20,
		PromptTokensDetails:     []dto.GeminiPromptTokensDetails{{Modality: "TEXT", TokenCount: 80}, {Modality: "IMAGE", TokenCount: 20}},
		CandidatesTokensDetails: []dto.GeminiPromptTokensDetails{{Modality: "TEXT", TokenCount: 20}},
	})}
	b.ReportAllocs()
	for b.Loop() {
		usageBillingPathForLog(false, usage)
	}
}
