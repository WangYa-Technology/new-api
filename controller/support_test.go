package controller

import (
	"context"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/paymentsecret"
	"github.com/QuantumNous/new-api/service"
	"github.com/glebarez/sqlite"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"gorm.io/gorm/schema"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/console_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGetSupportLinksReturnsConfiguredCategories(t *testing.T) {
	settings := console_setting.GetConsoleSetting()
	previous := settings.SupportLinks
	settings.SupportLinks = `[{"id":"community","title":"Community","items":[]}]`
	t.Cleanup(func() { settings.SupportLinks = previous })

	response := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(response)
	context.Request = httptest.NewRequest(http.MethodGet, "/api/support", nil)

	GetSupportLinks(context)

	var payload struct {
		Success bool                     `json:"success"`
		Data    []map[string]interface{} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(response.Body.Bytes(), &payload))
	assert.True(t, payload.Success)
	require.Len(t, payload.Data, 1)
	assert.Equal(t, "community", payload.Data[0]["id"])
	assert.Equal(t, "Community", payload.Data[0]["title"])
}

func TestGetStatusReturnsConfiguredFooter(t *testing.T) {
	settings := console_setting.GetConsoleSetting()
	previousFooter := settings.Footer
	settings.Footer = `{"description":"Custom footer","socialLinks":[],"columns":[]}`
	t.Cleanup(func() { settings.Footer = previousFooter })

	previousMap := common.OptionMap
	common.OptionMap = map[string]string{}
	t.Cleanup(func() { common.OptionMap = previousMap })

	response := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(response)
	context.Request = httptest.NewRequest(http.MethodGet, "/api/status", nil)

	GetStatus(context)

	var payload struct {
		Success bool `json:"success"`
		Data    struct {
			Footer *console_setting.FooterConfig `json:"footer_config"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(response.Body.Bytes(), &payload))
	assert.True(t, payload.Success)
	require.NotNil(t, payload.Data.Footer)
	assert.Equal(t, "Custom footer", payload.Data.Footer.Description)
}

func TestGetStatusReturnsConfiguredWalletPromotion(t *testing.T) {
	settings := console_setting.GetConsoleSetting()
	previousPromotion := settings.WalletPromotion
	settings.WalletPromotion = `{"enabled":true,"title":"Welcome bonus","description":"Extra credit for new accounts","actionLabel":"Learn more","actionUrl":"/offers/welcome","imageUrl":"https://example.com/promotion.png"}`
	t.Cleanup(func() { settings.WalletPromotion = previousPromotion })

	previousMap := common.OptionMap
	common.OptionMap = map[string]string{}
	t.Cleanup(func() { common.OptionMap = previousMap })

	response := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(response)
	context.Request = httptest.NewRequest(http.MethodGet, "/api/status", nil)

	GetStatus(context)

	var payload struct {
		Success bool `json:"success"`
		Data    struct {
			WalletPromotion *console_setting.WalletPromotionConfig `json:"wallet_promotion"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(response.Body.Bytes(), &payload))
	assert.True(t, payload.Success)
	require.NotNil(t, payload.Data.WalletPromotion)
	assert.Equal(t, "Welcome bonus", payload.Data.WalletPromotion.Title)
}

func TestSupportChatDatabaseMatrix(t *testing.T) {
	for _, dialect := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(dialect, func(t *testing.T) {
			var driver gorm.Dialector
			switch dialect {
			case "sqlite":
				driver = sqlite.Open(filepath.Join(t.TempDir(), "support.db"))
			case "mysql":
				if os.Getenv("TEST_MYSQL_DSN") == "" {
					t.Skip("TEST_MYSQL_DSN missing")
				}
				driver = mysql.Open(os.Getenv("TEST_MYSQL_DSN"))
			case "postgres":
				if os.Getenv("TEST_POSTGRES_DSN") == "" {
					t.Skip("TEST_POSTGRES_DSN missing")
				}
				driver = postgres.Open(os.Getenv("TEST_POSTGRES_DSN"))
			}
			db, err := gorm.Open(driver, &gorm.Config{Logger: logger.Discard, NamingStrategy: schema.NamingStrategy{TablePrefix: "support_test_"}})
			require.NoError(t, err)
			connection, err := db.DB()
			require.NoError(t, err)
			connection.SetMaxOpenConns(1)
			if dialect != "sqlite" {
				connection.SetMaxOpenConns(4)
			}
			previousDB, previousType := model.DB, common.MainDatabaseType()
			model.DB = db
			common.SetMainDatabaseType(common.DatabaseType(dialect))
			tables := []any{&model.SupportConversation{}, &model.SupportThread{}, &model.SupportMessage{}, &model.SupportSettings{}, &model.Option{}, &model.User{}}
			t.Cleanup(func() {
				require.NoError(t, db.Migrator().DropTable(tables...))
				model.DB = previousDB
				common.SetMainDatabaseType(previousType)
				require.NoError(t, connection.Close())
			})
			require.NoError(t, db.AutoMigrate(tables...))
			// Upgrade the deployed single-conversation format and run twice.
			legacy := model.SupportConversation{UserID: 71, Status: "human", AgentID: 9, Version: 4, UpdatedAt: 123}
			message := model.SupportMessage{UserID: 71, RequestID: "legacy", Sender: "agent", Body: "Existing reply"}
			require.NoError(t, db.Create(&message).Error)
			legacy.LastMessageID = message.ID
			legacy.UserReadID = message.ID
			require.NoError(t, db.Create(&legacy).Error)
			for range 2 {
				require.NoError(t, model.MigrateSupportThreads())
			}
			migrated, err := model.GetSupportConversation(71)
			require.NoError(t, err)
			assert.Equal(t, legacy.LastMessageID, migrated.LastMessageID)
			assert.Equal(t, legacy.UserReadID, migrated.UserReadID)
			assert.Equal(t, "human", migrated.Status)
			assert.Equal(t, 9, migrated.AgentID)
			legacyMessages, err := model.SupportHistory(71, 0)
			require.NoError(t, err)
			require.Len(t, legacyMessages, 1)
			assert.Equal(t, "Existing reply", legacyMessages[0].Body)

			firstID, secondID := "4df19a0e-b218-4e5e-93b8-397af26f674a", "57263289-96f9-455f-8051-e6e1757f9002"
			first, _, err := model.UpdateSupport(72, 0, nil, "send", "First question", "first-request", firstID)
			require.NoError(t, err)
			second, _, err := model.UpdateSupport(72, 0, nil, "send", "Second question", "second-request", secondID)
			require.NoError(t, err)
			_, insertedAgain, err := model.UpdateSupport(72, 0, nil, "send", "Second question", "second-request", secondID)
			require.NoError(t, err)
			assert.False(t, insertedAgain)
			_, _, err = model.UpdateSupport(72, 0, nil, "send", "Duplicate across threads", "first-request", secondID)
			assert.ErrorIs(t, err, model.ErrSupportConflict)
			_, _, err = model.UpdateSupport(73, 0, nil, "send", "Hijack", "hijack", firstID)
			require.Error(t, err)
			otherHistory, err := model.SupportHistory(73, 0, firstID)
			require.NoError(t, err)
			assert.Empty(t, otherHistory)
			_, _, err = model.UpdateSupport(72, 9, nil, "claim", "", "", firstID)
			require.NoError(t, err)
			_, _, err = model.UpdateSupport(72, 9, nil, "reply", "First reply", "first-reply", firstID)
			require.NoError(t, err)
			secondAfter, err := model.GetSupportConversation(72, secondID)
			require.NoError(t, err)
			assert.Equal(t, second, secondAfter)
			firstMessages, err := model.SupportHistory(72, 0, firstID)
			require.NoError(t, err)
			require.Len(t, firstMessages, 2)
			assert.Equal(t, "First question", firstMessages[0].Body)
			assert.Equal(t, "First reply", firstMessages[1].Body)
			require.NoError(t, model.MarkSupportRead(72, false, firstMessages[1].ID, firstID))
			firstAfter, err := model.GetSupportConversation(72, firstID)
			require.NoError(t, err)
			assert.Greater(t, firstAfter.UserReadID, first.UserReadID)
			secondAfter, err = model.GetSupportConversation(72, secondID)
			require.NoError(t, err)
			assert.Equal(t, second, secondAfter)
			for _, owner := range []int{72, 73} {
				response := httptest.NewRecorder()
				ctx, _ := gin.CreateTestContext(response)
				ctx.Set("id", owner)
				ctx.Request = httptest.NewRequest("GET", "/api/support-chat/conversations?user_id=72", nil)
				SupportChatConversations(ctx)
				require.Equal(t, 200, response.Code)
				var listing struct {
					Data struct {
						Items []model.SupportThread
						Total int64
					}
				}
				require.NoError(t, common.Unmarshal(response.Body.Bytes(), &listing))
				if owner == 72 {
					assert.Len(t, listing.Data.Items, 2)
					assert.Equal(t, int64(2), listing.Data.Total)
				} else {
					assert.Empty(t, listing.Data.Items)
					assert.Zero(t, listing.Data.Total)
				}
			}
			// Totals cover every category, regardless of the selected filter or page.
			for _, item := range []struct {
				status string
				agent  int
			}{{"waiting", 0}, {"human", 9}, {"human", 10}, {"resolved", 9}} {
				thread := model.SupportThread{ID: "counts-" + item.status + strconv.Itoa(item.agent), UserID: 999, Status: item.status, AgentID: item.agent}
				require.NoError(t, db.Create(&thread).Error)
			}
			queueResponse := httptest.NewRecorder()
			queueContext, _ := gin.CreateTestContext(queueResponse)
			queueContext.Set("id", 9)
			queueContext.Request = httptest.NewRequest("GET", "/api/support-chat/queue?status=resolved&page=2", nil)
			SupportChatQueue(queueContext)
			require.Equal(t, http.StatusOK, queueResponse.Code)
			var queuePayload struct {
				Data struct {
					Counts map[string]int64
					Total  int64
					Items  []model.SupportThread
				}
			}
			require.NoError(t, common.Unmarshal(queueResponse.Body.Bytes(), &queuePayload))
			assert.Equal(t, int64(1), queuePayload.Data.Counts["waiting"])
			assert.Equal(t, int64(3), queuePayload.Data.Counts["mine"])
			assert.Equal(t, int64(1), queuePayload.Data.Counts["resolved"])
			assert.Equal(t, int64(7), queuePayload.Data.Counts["all"])
			assert.Equal(t, int64(1), queuePayload.Data.Total)
			assert.Empty(t, queuePayload.Data.Items)
			var version string
			query := "select version()"
			if dialect == "sqlite" {
				query = "select sqlite_version()"
			}
			require.NoError(t, db.Raw(query).Scan(&version).Error)
			t.Logf("%s %s", dialect, version)
			settings := model.SupportSettings{ID: 1, QuickReplies: []string{}, Enabled: true, Knowledge: "Refunds require human approval."}
			require.NoError(t, db.Create(&settings).Error)
			conversation, inserted, err := model.UpdateSupport(7, 0, nil, "send", "Where is my order?", "request-one")
			require.NoError(t, err)
			require.True(t, inserted)
			originalVersion := conversation.Version
			_, inserted, err = model.UpdateSupport(7, 0, nil, "send", "Where is my order?", "request-one")
			require.NoError(t, err)
			assert.False(t, inserted)
			for range 2 {
				require.NoError(t, db.AutoMigrate(tables...))
			}
			messages, err := model.SupportHistory(7, 0)
			require.NoError(t, err)
			require.Len(t, messages, 1)
			assert.Equal(t, "Where is my order?", messages[0].Body)
			preserved, err := model.GetSupportSettings()
			require.NoError(t, err)
			assert.Equal(t, settings, preserved)
			response := httptest.NewRecorder()
			ctx, _ := gin.CreateTestContext(response)
			ctx.Request = httptest.NewRequest("PUT", "/api/support-chat/settings", strings.NewReader(`{"enabled":true,"knowledge":"Refunds require human approval.","quick_replies":[" Checking your order ","Please share a screenshot."]}`))
			ctx.Request.Header.Set("Content-Type", "application/json")
			SupportChatSettings(ctx)
			require.Equal(t, http.StatusOK, response.Code)
			saved, err := model.GetSupportSettings()
			require.NoError(t, err)
			assert.Equal(t, []string{"Checking your order", "Please share a screenshot."}, saved.QuickReplies)
			// Invalid updates must preserve both the existing settings and replies.
			response = httptest.NewRecorder()
			ctx, _ = gin.CreateTestContext(response)
			ctx.Request = httptest.NewRequest("PUT", "/api/support-chat/settings", strings.NewReader(`{"enabled":false,"quick_replies":[" "]}`))
			ctx.Request.Header.Set("Content-Type", "application/json")
			SupportChatSettings(ctx)
			require.Equal(t, http.StatusBadRequest, response.Code)
			unchanged, err := model.GetSupportSettings()
			require.NoError(t, err)
			assert.Equal(t, saved, unchanged)

			_, _, err = model.UpdateSupport(7, 9, nil, "claim", "", "")
			require.NoError(t, err)
			_, _, err = model.UpdateSupport(7, 0, &originalVersion, "ai", "stale answer", "ai:one")
			assert.ErrorIs(t, err, model.ErrSupportConflict)
			_, _, err = model.UpdateSupport(7, 10, nil, "reply", "unauthorized reply", "bad")
			assert.ErrorIs(t, err, model.ErrSupportConflict)
			_, _, err = model.UpdateSupport(7, 9, nil, "reply", "I can help.", "staff-one")
			require.NoError(t, err)
			_, _, err = model.UpdateSupport(7, 9, nil, "resolve", "", "")
			require.NoError(t, err)
			_, _, err = model.UpdateSupport(7, 0, nil, "send", "Another question", "request-two")
			assert.ErrorIs(t, err, model.ErrSupportConflict)
			conversation, _, err = model.UpdateSupport(7, 0, nil, "reopen", "", "")
			require.NoError(t, err)
			assert.Equal(t, "waiting", conversation.Status)
			assert.Zero(t, conversation.AgentID)
			assert.Positive(t, conversation.WaitingSince)
			_, _, err = model.UpdateSupport(7, 0, nil, "send", "Another question", "request-two")
			require.NoError(t, err)
			// The owner is derived from authentication, never from user-controlled query data.
			recorder := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(recorder)
			c.Set("id", 8)
			c.Request = httptest.NewRequest("GET", "/api/support-chat/history?user_id=7", nil)
			SupportChatHistory(c)
			var result struct {
				Data struct {
					Messages []model.SupportMessage `json:"messages"`
				} `json:"data"`
			}
			require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &result))
			assert.Empty(t, result.Data.Messages)
			// A user's action endpoint cannot impersonate a human or inject AI messages.
			recorder = httptest.NewRecorder()
			c, _ = gin.CreateTestContext(recorder)
			c.Set("id", 7)
			c.Request = httptest.NewRequest("POST", "/api/support-chat/action", strings.NewReader(`{"action":"reply","body":"fake staff"}`))
			c.Request.Header.Set("Content-Type", "application/json")
			SupportChatAction(c)
			assert.Equal(t, 400, recorder.Code)
			require.NoError(t, model.MarkSupportRead(7, false, 999999))
			current, err := model.GetSupportConversation(7)
			require.NoError(t, err)
			assert.Less(t, current.UserReadID, int64(999999))
			draftResponse := httptest.NewRecorder()
			draftContext, _ := gin.CreateTestContext(draftResponse)
			draftContext.Request = httptest.NewRequest("GET", "/api/support-chat/knowledge-settings", nil)
			SupportKnowledgeSettings(draftContext)
			require.Equal(t, 200, draftResponse.Code)
			assert.Contains(t, draftResponse.Body.String(), "Refunds require human approval.")
			assert.Contains(t, draftResponse.Body.String(), `"published":false`)
			document := model.SupportKnowledge{Revision: 1, Articles: []model.SupportArticle{
				{ID: "5adf30bd-bf3e-4734-a678-b6d53d053120", Title: "AI question help", Content: "Second question: open the settings page for help.", Published: true},
				{ID: "f297eb82-246c-4c4b-a441-f80fec158a90", Title: "Private draft", Content: "DRAFT-SECRET", Published: false},
			}}
			require.NoError(t, model.SaveSupportDocument(model.SupportKnowledgeKey, 0, document))
			assert.ErrorIs(t, model.SaveSupportDocument(model.SupportKnowledgeKey, 0, document), model.ErrSupportConflict)
			published, err := service.PublishedSupportArticles()
			require.NoError(t, err)
			for _, article := range published {
				assert.NotContains(t, article.Content, "DRAFT-SECRET")
			}
			assert.NotEmpty(t, service.RetrieveSupportArticles("Second question", published))
			assert.Empty(t, service.RetrieveSupportArticles("unrelatedxyz", published))
			assert.True(t, service.SupportNeedsHuman("请转人工处理退款"))
			t.Setenv("SUPPORT_AI_MODEL", "support-test")
			t.Setenv("SUPPORT_AI_API_KEY", "test-key")
			upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				assert.Equal(t, "/responses", r.URL.Path)
				assert.Equal(t, "Bearer test-key", r.Header.Get("Authorization"))
				var request map[string]any
				require.NoError(t, common.DecodeJson(r.Body, &request))
				assert.Equal(t, float64(4096), request["max_output_tokens"])
				assert.Equal(t, true, request["stream"])
				assert.Equal(t, false, request["store"])
				encoded, _ := common.Marshal(request)
				assert.NotContains(t, string(encoded), "DRAFT-SECRET")
				writeSupportResponse(t, w, "{\"answer\":\"Please contact support for refunds.\",\"sources\":[\"5adf30bd-bf3e-4734-a678-b6d53d053120\"],\"handoff\":false}")
			}))
			defer upstream.Close()
			t.Setenv("SUPPORT_AI_BASE_URL", upstream.URL)
			aiThread, _, err := model.UpdateSupport(70, 0, nil, "send", "AI question", "ai-question")
			require.NoError(t, err)
			require.NoError(t, service.ReplySupport(context.Background(), 70, aiThread.Version, "ai-question"))
			messages, err = model.SupportHistory(70, 0)
			require.NoError(t, err)
			assert.Equal(t, "ai", messages[len(messages)-1].Sender)

			defaultAI, err := model.GetSupportAIConfig()
			require.NoError(t, err)
			assert.False(t, defaultAI.DailyLimitEnabled)
			var budgetRows int64
			require.NoError(t, db.Model(&model.Option{}).Where(&model.Option{Key: "SupportAIDailyUsage"}).Count(&budgetRows).Error)
			assert.Zero(t, budgetRows, "disabled daily limit must not reserve budget")

			greetingProvider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				writeSupportResponse(t, w, "{\"answer\":\"你好！有什么可以帮您？\",\"sources\":[],\"handoff\":false}")
			}))
			defer greetingProvider.Close()
			t.Setenv("SUPPORT_AI_BASE_URL", greetingProvider.URL)
			greetingThread, _, err := model.UpdateSupport(703, 0, nil, "send", "如何排查网络连接问题？", "greeting")
			require.NoError(t, err)
			require.NoError(t, service.ReplySupport(context.Background(), 703, greetingThread.Version, "greeting"))
			greetingHistory, err := model.SupportHistory(703, 0)
			require.NoError(t, err)
			require.Len(t, greetingHistory, 2)
			assert.Equal(t, "ai", greetingHistory[1].Sender)
			assert.Contains(t, greetingHistory[1].Body, "有什么可以帮您")
			assert.False(t, service.SupportNeedsHuman("你好，请给我退款"))
			assert.False(t, service.SupportNeedsHuman("hello, what is my balance?"))

			for i, content := range []string{"你好，有什么可以帮您？", "```json\n{\"answer\":\"您好，请问有什么问题？\",\"sources\":[]}\n```", "你好，请描述您的问题。"} {
				provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					writeSupportResponse(t, w, content)
				}))
				t.Setenv("SUPPORT_AI_BASE_URL", provider.URL)
				thread, _, err := model.UpdateSupport(710+i, 0, nil, "send", "你好", "plain-reply")
				require.NoError(t, err)
				replyErr := service.ReplySupport(context.Background(), 710+i, thread.Version, "plain-reply")
				provider.Close()
				require.NoError(t, replyErr)
				replies, err := model.SupportHistory(710+i, 0)
				require.NoError(t, err)
				require.Len(t, replies, 2)
				assert.Equal(t, "ai", replies[1].Sender)
				assert.NotContains(t, replies[1].Body, "```json")
			}

			// The HTTP action returns before the provider completes. A partial answer is
			// visible without exposing reasoning, and completion persists one AI reply.
			chunkSent, finishStream := make(chan struct{}), make(chan struct{})
			streamProvider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "text/event-stream")
				_, _ = w.Write([]byte("data: {\"type\":\"response.reasoning_text.delta\",\"delta\":\"PRIVATE\"}\n\ndata: {\"type\":\"response.output_text.delta\",\"delta\":\"Hello\"}\n\n"))
				w.(http.Flusher).Flush()
				close(chunkSent)
				<-finishStream
				writeSupportResponse(t, w, " world")
			}))
			defer streamProvider.Close()
			t.Setenv("SUPPORT_AI_BASE_URL", streamProvider.URL)
			streamRecorder := httptest.NewRecorder()
			streamContext, _ := gin.CreateTestContext(streamRecorder)
			streamContext.Set("id", 720)
			streamContext.Request = httptest.NewRequest("POST", "/api/support-chat/action", strings.NewReader(`{"action":"send","body":"hello","request_id":"8845b036-7517-43df-9931-c026d443d188"}`))
			streamContext.Request.Header.Set("Content-Type", "application/json")
			SupportChatAction(streamContext)
			assert.Equal(t, 200, streamRecorder.Code)
			<-chunkSent
			streamThread, err := model.GetSupportConversation(720)
			require.NoError(t, err)
			require.Eventually(t, func() bool {
				preview := service.SupportReplyPreview(streamThread)
				return preview != nil && *preview == "Hello"
			}, 3*time.Second, 10*time.Millisecond)
			close(finishStream)
			require.Eventually(t, func() bool {
				replies, err := model.SupportHistory(720, 0)
				return err == nil && len(replies) == 2 && strings.Contains(replies[1].Body, "Hello world") && !strings.Contains(replies[1].Body, "PRIVATE")
			}, 3*time.Second, 10*time.Millisecond)

			for i, tc := range []struct {
				name, events, expected string
				interrupted            bool
				wantError              bool
			}{
				{name: "incomplete", events: `data: {"type":"response.output_text.delta","delta":"Partial answer"}

data: {"type":"response.incomplete"}

`, expected: "Partial answer", interrupted: true},
				{name: "disconnected", events: `data: {"type":"response.output_text.delta","delta":"Already generated"}

`, expected: "Already generated", interrupted: true},
				{name: "reasoning only", events: `data: {"type":"response.reasoning_text.delta","delta":"private"}

data: {"type":"response.completed"}

`, wantError: true},
				{name: "final snapshot", events: `data: {"type":"response.completed","response":{"output":[{"type":"message","content":[{"type":"output_text","text":"Final answer"}]}]}}

`, expected: "Final answer"},
			} {
				t.Run(tc.name, func(t *testing.T) {
					provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte(tc.events)) }))
					defer provider.Close()
					t.Setenv("SUPPORT_AI_BASE_URL", provider.URL)
					thread, _, err := model.UpdateSupport(730+i, 0, nil, "send", "hello", "stream-boundary")
					require.NoError(t, err)
					err = service.ReplySupport(context.Background(), 730+i, thread.Version, "stream-boundary")
					if tc.wantError {
						require.Error(t, err)
						return
					}
					require.NoError(t, err)
					replies, err := model.SupportHistory(730+i, 0)
					require.NoError(t, err)
					require.Len(t, replies, 2)
					assert.Contains(t, replies[1].Body, tc.expected)
					current, err := model.GetSupportConversation(730 + i)
					require.NoError(t, err)
					if tc.interrupted {
						assert.Contains(t, replies[1].Body, `"interrupted":true`)
						assert.Equal(t, "waiting", current.Status)
					} else {
						assert.Equal(t, "ai", current.Status)
					}
				})
			}

			// Model context and generated replies belong only to the selected thread.
			scopedUpstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				var request struct {
					Input []struct {
						Role    string
						Content string
					}
				}
				require.NoError(t, common.DecodeJson(r.Body, &request))
				require.Len(t, request.Input, 2)
				assert.Equal(t, "Second question", request.Input[1].Content)
				writeSupportResponse(t, w, "{\"answer\":\"Second answer\",\"sources\":[\"5adf30bd-bf3e-4734-a678-b6d53d053120\"],\"handoff\":false}")
			}))
			defer scopedUpstream.Close()
			t.Setenv("SUPPORT_AI_BASE_URL", scopedUpstream.URL)
			require.NoError(t, service.ReplySupport(context.Background(), 72, second.Version, "second-request", secondID))
			secondMessages, err := model.SupportHistory(72, 0, secondID)
			require.NoError(t, err)
			require.Len(t, secondMessages, 2)
			assert.Contains(t, secondMessages[1].Body, `"answer":"Second answer"`)
			firstUnchanged, err := model.SupportHistory(72, 0, firstID)
			require.NoError(t, err)
			assert.Equal(t, firstMessages, firstUnchanged)

			// A takeover while the provider is generating must win over its reply.
			started, release := make(chan struct{}), make(chan struct{})
			racingUpstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				close(started)
				<-release
				writeSupportResponse(t, w, "{\"answer\":\"late reply\",\"sources\":[\"5adf30bd-bf3e-4734-a678-b6d53d053120\"],\"handoff\":false}")
			}))
			defer racingUpstream.Close()
			t.Setenv("SUPPORT_AI_BASE_URL", racingUpstream.URL)
			racing, _, err := model.UpdateSupport(11, 0, nil, "send", "need help", "race-question")
			require.NoError(t, err)
			done := make(chan error, 1)
			go func() { done <- service.ReplySupport(context.Background(), 11, racing.Version, "race-question") }()
			<-started
			_, _, claimErr := model.UpdateSupport(11, 9, nil, "claim", "", "")
			close(release)
			require.NoError(t, claimErr)
			assert.ErrorIs(t, <-done, model.ErrSupportConflict)
			raceHistory, err := model.SupportHistory(11, 0)
			require.NoError(t, err)
			require.Len(t, raceHistory, 1)
			assert.Equal(t, "user", raceHistory[0].Sender)
			failingUpstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(503) }))
			defer failingUpstream.Close()
			t.Setenv("SUPPORT_AI_BASE_URL", failingUpstream.URL)
			recorder = httptest.NewRecorder()
			c, _ = gin.CreateTestContext(recorder)
			c.Set("id", 12)
			c.Request = httptest.NewRequest("POST", "/api/support-chat/action", strings.NewReader(`{"action":"send","body":"help","request_id":"51d80f3a-e66f-4ce4-9c86-98da67c65f45"}`))
			c.Request.Header.Set("Content-Type", "application/json")
			SupportChatAction(c)
			assert.Equal(t, 200, recorder.Code)
			require.Eventually(t, func() bool {
				thread, err := model.GetSupportConversation(12)
				return err == nil && thread.Status == "waiting"
			}, 3*time.Second, 10*time.Millisecond)

			invalidSourceUpstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				writeSupportResponse(t, w, "{\"answer\":\"Not public\",\"sources\":[\"f297eb82-246c-4c4b-a441-f80fec158a90\"]}")
			}))
			defer invalidSourceUpstream.Close()
			t.Setenv("SUPPORT_AI_BASE_URL", invalidSourceUpstream.URL)
			invalidSourceResponse := httptest.NewRecorder()
			invalidSourceContext, _ := gin.CreateTestContext(invalidSourceResponse)
			invalidSourceContext.Set("id", 701)
			invalidSourceContext.Request = httptest.NewRequest("POST", "/api/support-chat/action", strings.NewReader(`{"action":"send","body":"AI question","request_id":"9c114bf8-e1d8-4b01-b18c-a989c6b608d9"}`))
			invalidSourceContext.Request.Header.Set("Content-Type", "application/json")
			SupportChatAction(invalidSourceContext)
			require.Equal(t, 200, invalidSourceResponse.Code)
			require.Eventually(t, func() bool {
				thread, err := model.GetSupportConversation(701)
				return err == nil && thread.Status == "waiting"
			}, 3*time.Second, 10*time.Millisecond)

			invalidSourceHistory, err := model.SupportHistory(701, 0)
			require.NoError(t, err)
			require.Len(t, invalidSourceHistory, 1)
			assert.Equal(t, "user", invalidSourceHistory[0].Sender)
			humanThread, _, err := model.UpdateSupport(702, 0, nil, "send", "请转人工", "explicit-human")
			require.NoError(t, err)
			require.NoError(t, service.ReplySupport(context.Background(), 702, humanThread.Version, "explicit-human"))
			humanThread, err = model.GetSupportConversation(702)
			require.NoError(t, err)
			assert.Equal(t, "waiting", humanThread.Status)
			// Notes and activity stay staff-only, including history pagination.
			thread, _, err := model.UpdateSupport(90, 0, nil, "send", "Private issue", "private-question")
			require.NoError(t, err)
			_, _, err = model.UpdateSupport(90, 9, &thread.Version, "claim", "", "")
			require.NoError(t, err)
			noteThread, inserted, err := model.UpdateSupport(90, 9, nil, "note", "Staff-only detail", "private-note")
			require.NoError(t, err)
			require.True(t, inserted)
			public, err := model.SupportHistory(90, 0)
			require.NoError(t, err)
			require.Len(t, public, 1)
			assert.Equal(t, "Private issue", public[0].Body)
			assert.Equal(t, public[0].ID, noteThread.LastMessageID)
			private, err := model.SupportHistoryForStaff(90, 0, true)
			require.NoError(t, err)
			require.Len(t, private, 3)
			assert.Equal(t, "note", private[2].Sender)
			assert.Equal(t, 9, private[2].ActorID)
			_, inserted, err = model.UpdateSupport(90, 9, nil, "note", "Staff-only detail", "private-note")
			require.NoError(t, err)
			assert.False(t, inserted)
			_, _, err = model.UpdateSupport(90, 9, nil, "note", "Different text", "private-note")
			assert.ErrorIs(t, err, model.ErrSupportConflict)
			_, _, err = model.UpdateSupportWithTarget(90, 10, 11, nil, "transfer", "", "")
			assert.ErrorIs(t, err, model.ErrSupportConflict)
			transferred, _, err := model.UpdateSupportWithTarget(90, 9, 10, &noteThread.Version, "transfer", "", "")
			require.NoError(t, err)
			assert.Equal(t, 10, transferred.AgentID)
			_, _, err = model.UpdateSupport(90, 9, nil, "reply", "Stale agent", "stale-agent")
			assert.ErrorIs(t, err, model.ErrSupportConflict)
			_, _, err = model.UpdateSupport(90, 10, nil, "reply", "New agent", "new-agent")
			require.NoError(t, err)
			// Concurrent claims are atomic; a stale version cannot overwrite the winner.
			pending, _, err := model.UpdateSupport(91, 0, nil, "handoff", "", "")
			require.NoError(t, err)
			claims := make(chan error, 2)
			for _, agent := range []int{9, 10} {
				go func(id int) {
					_, _, claimErr := model.UpdateSupport(91, id, &pending.Version, "claim", "", "")
					claims <- claimErr
				}(agent)
			}
			successes := 0
			for range 2 {
				claimErr := <-claims
				if claimErr == nil {
					successes++
				} else {
					assert.ErrorIs(t, claimErr, model.ErrSupportConflict)
				}
			}
			assert.Equal(t, 1, successes)
			// A user cannot submit internal notes or transfer actions through the user API.
			for _, action := range []string{"note", "transfer", "claim"} {
				response := httptest.NewRecorder()
				ctx, _ := gin.CreateTestContext(response)
				ctx.Set("id", 90)
				ctx.Request = httptest.NewRequest("POST", "/api/support-chat/action", strings.NewReader(`{"action":"`+action+`","body":"secret"}`))
				ctx.Request.Header.Set("Content-Type", "application/json")
				SupportChatAction(ctx)
				assert.Equal(t, 400, response.Code)
			}
			// Recovery only hands off unanswered AI work, and never clears unread replies when sending.
			stalled, _, err := model.UpdateSupport(92, 0, nil, "send", "Unanswered", "stalled")
			require.NoError(t, err)
			require.NoError(t, db.Model(&model.SupportThread{}).Where("id = ?", stalled.ID).Update("updated_at", 1).Error)
			require.NoError(t, model.RecoverSupportReplies(92))
			recovered, err := model.GetSupportConversation(92)
			require.NoError(t, err)
			assert.Equal(t, "waiting", recovered.Status)
			assert.Greater(t, recovered.Version, stalled.Version)
			require.NoError(t, db.Model(&model.SupportThread{}).Where("user_id = ?", 70).Update("updated_at", 1).Error)
			require.NoError(t, model.RecoverSupportReplies(70))
			answered, err := model.GetSupportConversation(70)
			require.NoError(t, err)
			assert.Equal(t, "ai", answered.Status)
			unread, err := model.SupportUnreadCount(answered.ID, false, answered.UserReadID)
			require.NoError(t, err)
			assert.Equal(t, int64(1), unread)
			_, _, err = model.UpdateSupport(70, 0, nil, "send", "Next question", "next-question")
			require.NoError(t, err)
			stillUnread, err := model.GetSupportConversation(70)
			require.NoError(t, err)
			assert.Equal(t, answered.UserReadID, stillUnread.UserReadID)
			profileUser := model.User{Id: 90, Username: "support-customer", DisplayName: "Customer", Email: "customer@example.com", Password: "not-a-real-password", Status: common.UserStatusEnabled}
			require.NoError(t, db.Create(&profileUser).Error)
			profileResponse := httptest.NewRecorder()
			profileContext, _ := gin.CreateTestContext(profileResponse)
			profileContext.Params = gin.Params{{Key: "userID", Value: "90"}}
			profileContext.Set("role", common.RoleAdminUser)
			SupportChatProfile(profileContext)
			require.Equal(t, 200, profileResponse.Code)
			var profilePayload struct{ Data map[string]any }
			require.NoError(t, common.Unmarshal(profileResponse.Body.Bytes(), &profilePayload))
			assert.Equal(t, "customer@example.com", profilePayload.Data["email"])
			assert.NotContains(t, profilePayload.Data, "password")
			assert.NotContains(t, profilePayload.Data, "quota")
			privateResponse := httptest.NewRecorder()
			privateContext, _ := gin.CreateTestContext(privateResponse)
			privateContext.Set("id", 90)
			privateContext.Request = httptest.NewRequest("GET", "/api/support-chat/history", nil)
			SupportChatHistory(privateContext)
			assert.NotContains(t, privateResponse.Body.String(), "Staff-only detail")
			deniedResponse := httptest.NewRecorder()
			deniedContext, _ := gin.CreateTestContext(deniedResponse)
			deniedContext.Set("role", common.RoleCommonUser)
			deniedContext.Params = gin.Params{{Key: "userID", Value: "90"}}
			SupportChatOrders(deniedContext)
			assert.Equal(t, 403, deniedResponse.Code)
			publicHandoff, err := model.SupportHistory(12, 0)
			require.NoError(t, err)
			for _, message := range publicHandoff {
				assert.NotEqual(t, "note", message.Sender)
			}
			internalHandoff, err := model.SupportHistoryForStaff(12, 0, true)
			require.NoError(t, err)
			foundSummary := false
			for _, message := range internalHandoff {
				if message.Sender == "note" && strings.Contains(message.Body, "unverified") {
					foundSummary = true
				}
			}
			assert.True(t, foundSummary)
			require.NoError(t, db.Where(&model.Option{Key: "SupportAIDailyUsage"}).Delete(&model.Option{}).Error)
			require.NoError(t, model.ReserveSupportAIRequest(1))
			assert.Error(t, model.ReserveSupportAIRequest(1))
			config := model.SupportAIConfig{Revision: 1, Enabled: true, Model: "dedicated-model", DailyRequests: 20}
			require.NoError(t, model.SaveSupportDocument(model.SupportAIConfigKey, 0, config))
			responseConfig := httptest.NewRecorder()
			configCtx, _ := gin.CreateTestContext(responseConfig)
			configCtx.Request = httptest.NewRequest("GET", "/api/support-chat/ai-settings", nil)
			SupportAISettings(configCtx)
			assert.NotContains(t, responseConfig.Body.String(), "test-key")
			assert.Contains(t, responseConfig.Body.String(), "dedicated-model")
			// Missing model credentials persist a human handoff rather than losing the message.
			t.Setenv("SUPPORT_AI_API_KEY", "")
			current, _, err = model.UpdateSupport(8, 0, nil, "send", "help", "request-three")
			require.NoError(t, err)
			require.NoError(t, service.ReplySupport(context.Background(), 8, current.Version, "request-three"))
			current, err = model.GetSupportConversation(8)
			require.NoError(t, err)
			assert.Equal(t, "waiting", current.Status)
			keyFile := filepath.Join(t.TempDir(), "keys.json")
			require.NoError(t, paymentsecret.GenerateFile(keyFile))
			t.Setenv("PAYMENT_SECRET_KEY_FILE", keyFile)
			for _, tc := range []struct {
				body    string
				success bool
			}{
				{`{"revision":1,"enabled":true,"model":"support-test","daily_requests":20,"base_url":"https://example.com/v1","api_key":"new-private-key"}`, true},
				{`{"revision":2,"enabled":true,"model":"updated-model","daily_requests":30,"daily_limit_enabled":true,"base_url":"https://example.com/v1","api_key":""}`, true},
				{`{"revision":3,"enabled":true,"model":"updated-model","daily_requests":30,"base_url":"https://other.example.com/v1","api_key":""}`, false},
			} {
				response := httptest.NewRecorder()
				ctx, _ := gin.CreateTestContext(response)
				ctx.Request = httptest.NewRequest("PUT", "/api/support-chat/ai-settings", strings.NewReader(tc.body))
				ctx.Request.Header.Set("Content-Type", "application/json")
				SupportAISettings(ctx)
				var payload struct{ Success bool }
				require.NoError(t, common.Unmarshal(response.Body.Bytes(), &payload))
				assert.Equal(t, tc.success, payload.Success)
				assert.NotContains(t, response.Body.String(), "new-private-key")
				assert.NotContains(t, response.Body.String(), "api_key_cipher")
			}
			savedAI, err := model.GetSupportAIConfig()
			require.NoError(t, err)
			assert.Equal(t, int64(3), savedAI.Revision)
			assert.Equal(t, "updated-model", savedAI.Model)
			assert.True(t, savedAI.DailyLimitEnabled)
			secret, err := savedAI.APIKey()
			require.NoError(t, err)
			assert.Equal(t, "new-private-key", secret)
			var stored model.Option
			require.NoError(t, db.Where(&model.Option{Key: model.SupportAIConfigKey}).First(&stored).Error)
			assert.NotContains(t, stored.Value, "new-private-key")
			assert.Contains(t, stored.Value, paymentsecret.Prefix)

		})
	}
}

func writeSupportResponse(t *testing.T, w http.ResponseWriter, answer string) {
	t.Helper()
	w.Header().Set("Content-Type", "text/event-stream")
	encoded, err := common.Marshal(map[string]any{"type": "response.output_text.delta", "delta": answer})
	require.NoError(t, err)
	_, err = w.Write([]byte("data: " + string(encoded) + "\n\ndata: {\"type\":\"response.completed\"}\n\n"))
	require.NoError(t, err)
}
