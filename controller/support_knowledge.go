package controller

import (
	"fmt"
	"github.com/QuantumNous/new-api/pkg/paymentsecret"
	"net/http"
	"net/url"
	"os"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func SupportPublishedKnowledge(c *gin.Context) {
	articles, err := service.PublishedSupportArticles()
	if err != nil {
		supportFailure(c, err)
		return
	}
	common.ApiSuccess(c, articles)
}

func SupportKnowledgeSettings(c *gin.Context) {
	document := model.SupportKnowledge{Articles: []model.SupportArticle{}}
	if c.Request.Method == http.MethodPut {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 1<<20)
		if c.ShouldBindJSON(&document) != nil || document.Revision < 0 || len(document.Articles) > 100 {
			c.AbortWithStatus(400)
			return
		}
		ids := map[string]bool{}
		for i := range document.Articles {
			a := &document.Articles[i]
			a.Title, a.Content = strings.TrimSpace(a.Title), strings.TrimSpace(a.Content)
			if _, err := uuid.Parse(a.ID); err != nil || ids[a.ID] || a.Title == "" || len(a.Title) > 600 || a.Content == "" || len(a.Content) > 16000 {
				c.AbortWithStatus(400)
				return
			}
			ids[a.ID] = true
		}
		document.Revision++
		if err := model.SaveSupportDocument(model.SupportKnowledgeKey, document.Revision-1, document); err != nil {
			supportFailure(c, err)
			return
		}
	} else if err := model.ReadSupportDocument(model.SupportKnowledgeKey, &document); err != nil {
		supportFailure(c, err)
		return
	}
	if c.Request.Method == http.MethodGet && document.Revision == 0 && len(document.Articles) == 0 {
		legacy, err := model.GetSupportSettings()
		if err != nil {
			supportFailure(c, err)
			return
		}
		if strings.TrimSpace(legacy.Knowledge) != "" {
			// The old blob may contain internal material. Import as a draft, never
			// publish it automatically. Preserve the original for rollback.
			content := []rune(legacy.Knowledge)
			for offset := 0; offset < len(content); offset += 4000 {
				document.Articles = append(document.Articles, model.SupportArticle{ID: uuid.NewString(), Title: "Imported support knowledge", Content: string(content[offset:min(offset+4000, len(content))]), Published: false})
			}
		}
	}
	common.ApiSuccess(c, document)
}

func SupportAISettings(c *gin.Context) {
	config, err := model.GetSupportAIConfig()
	if err != nil {
		supportFailure(c, err)
		return
	}
	if c.Request.Method == http.MethodPut {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 8<<10)
		var input struct {
			model.SupportAIConfig
			APIKey string `json:"api_key"`
		}
		if c.ShouldBindJSON(&input) != nil {
			c.AbortWithStatus(400)
			return
		}
		previous := config
		config = input.SupportAIConfig
		config.APIKeyCipher = previous.APIKeyCipher
		if config.Revision < 0 || (config.DailyLimitEnabled && (config.DailyRequests < 1 || config.DailyRequests > 10000)) || len(config.Model) > 200 || strings.ContainsAny(config.Model, "\r\n") || len(config.WelcomeMessage) > 2000 {
			c.AbortWithStatus(400)
			return
		}
		config.BaseURL = strings.TrimRight(strings.TrimSpace(config.BaseURL), "/")
		endpoint, parseErr := url.Parse(config.BaseURL)
		if (config.BaseURL != "" && (parseErr != nil || (endpoint.Scheme != "https" && endpoint.Scheme != "http") || endpoint.Hostname() == "" || endpoint.User != nil || endpoint.RawQuery != "" || endpoint.Fragment != "" || len(config.BaseURL) > 2000)) || len(input.APIKey) > 4096 || strings.ContainsAny(input.APIKey, "\r\n") {
			c.AbortWithStatus(400)
			return
		}
		input.APIKey = strings.TrimSpace(input.APIKey)
		if config.BaseURL != strings.TrimRight(previous.BaseURL, "/") && input.APIKey == "" {
			common.ApiErrorMsg(c, "Changing the API endpoint requires a new API key.")
			return
		}
		if input.APIKey != "" {
			ring, err := paymentsecret.Load()
			if err != nil {
				supportFailure(c, err)
				return
			}
			config.APIKeyCipher, err = ring.Seal(input.APIKey, "support/ai/api_key")
			if err != nil {
				supportFailure(c, err)
				return
			}
		}
		config.Model = strings.TrimSpace(config.Model)
		config.Revision++
		if err := model.SaveSupportDocument(model.SupportAIConfigKey, config.Revision-1, config); err != nil {
			supportFailure(c, err)
			return
		}
		common.SysLog(fmt.Sprintf("user %d updated support AI configuration revision %d", c.GetInt("id"), config.Revision))
	}
	key, err := config.APIKey()
	if err != nil {
		supportFailure(c, err)
		return
	}
	configured := config.BaseURL != "" && key != ""
	config.APIKeyCipher = ""
	common.ApiSuccess(c, gin.H{"config": config, "credentials_configured": configured, "default_model": os.Getenv("SUPPORT_AI_MODEL")})
}
