package controller

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/service/authz"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func SupportChatInfo(c *gin.Context) {
	s, err := model.GetSupportSettings()
	if err != nil {
		supportFailure(c, err)
		return
	}
	info := gin.H{"enabled": s.Enabled, "offline_message": s.OfflineMessage, "ai_available": service.SupportAIConfigured(), "staff": authz.Can(c.GetInt("id"), c.GetInt("role"), authz.SupportOperate)}
	config, err := model.GetSupportAIConfig()
	if err != nil {
		supportFailure(c, err)
		return
	}
	info["welcome_message"] = config.WelcomeMessage
	if info["staff"] == true {
		info["quick_replies"] = s.QuickReplies
	}
	common.ApiSuccess(c, info)
}

func SupportChatSettings(c *gin.Context) {
	if c.Request.Method == http.MethodPut {
		var s model.SupportSettings
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 256<<10)
		if c.ShouldBindJSON(&s) != nil || len(s.Knowledge) > 60000 || len(s.OfflineMessage) > 2000 {
			c.AbortWithStatus(http.StatusBadRequest)
			return
		}
		if len(s.QuickReplies) > 20 {
			c.AbortWithStatus(http.StatusBadRequest)
			return
		}
		for i, reply := range s.QuickReplies {
			s.QuickReplies[i] = strings.TrimSpace(reply)
			if s.QuickReplies[i] == "" || utf8.RuneCountInString(s.QuickReplies[i]) > 2000 {
				c.AbortWithStatus(http.StatusBadRequest)
				return
			}
		}
		if s.QuickReplies == nil {
			s.QuickReplies = []string{}
		}
		encoded, err := common.Marshal(s.QuickReplies)
		if err != nil {
			supportFailure(c, err)
			return
		}
		s.ID = 1
		if err := model.DB.Transaction(func(tx *gorm.DB) error {
			if err := tx.Clauses(clause.OnConflict{UpdateAll: true}).Create(&s).Error; err != nil {
				return err
			}
			return tx.Clauses(clause.OnConflict{UpdateAll: true}).Create(&model.Option{Key: "SupportQuickReplies", Value: string(encoded)}).Error
		}); err != nil {
			supportFailure(c, err)
			return
		}
	}
	s, err := model.GetSupportSettings()
	if err != nil {
		supportFailure(c, err)
		return
	}
	common.ApiSuccess(c, s)
}

// Staff routes are separately protected by RequirePermission; user routes never
// accept a user ID supplied in JSON or query parameters.
func SupportChatHistory(c *gin.Context) {
	userID := c.GetInt("id")
	if c.Param("userID") != "" {
		var err error
		userID, err = strconv.Atoi(c.Param("userID"))
		if err != nil || userID <= 0 {
			c.AbortWithStatus(400)
			return
		}
	}
	if err := model.RecoverSupportReplies(userID); err != nil {
		supportFailure(c, err)
		return
	}
	before, _ := strconv.ParseInt(c.Query("before"), 10, 64)
	conversation, err := model.GetSupportConversation(userID, c.Query("thread_id"))
	if err != nil {
		supportFailure(c, err)
		return
	}
	messages, err := model.SupportHistoryForStaff(userID, before, c.Param("userID") != "", c.Query("thread_id"))
	if err != nil {
		supportFailure(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"conversation": conversation, "messages": messages, "ai_draft": service.SupportReplyPreview(conversation)})
}

func SupportChatQueue(c *gin.Context) {
	if err := model.RecoverSupportReplies(0); err != nil {
		supportFailure(c, err)
		return
	}
	page, _ := strconv.Atoi(c.Query("page"))
	page = max(1, min(page, 10000))
	conversations := []model.SupportThread{}
	q := model.DB.Model(&model.SupportThread{})
	switch c.Query("status") {
	case "resolved":
		q = q.Where("status = ?", "resolved")
	case "waiting":
		q = q.Where("status = ?", "waiting")
	case "mine":
		q = q.Where("status = ? AND agent_id = ?", "human", c.GetInt("id"))
	case "all":
	default:
		q = q.Where("status <> ?", "resolved")
	}
	var groups []struct {
		Status  string
		AgentID int
		Total   int64
	}
	if err := model.DB.Model(&model.SupportThread{}).Select("status, agent_id, COUNT(*) AS total").Group("status, agent_id").Scan(&groups).Error; err != nil {
		supportFailure(c, err)
		return
	}
	counts := map[string]int64{"waiting": 0, "mine": 0, "all": 0, "resolved": 0}
	for _, group := range groups {
		counts["all"] += group.Total
		if group.Status == "waiting" || group.Status == "resolved" {
			counts[group.Status] += group.Total
		}
		if group.Status == "human" && group.AgentID == c.GetInt("id") {
			counts["mine"] += group.Total
		}
	}
	total, known := counts[c.Query("status")]
	if !known {
		total = counts["all"] - counts["resolved"]
	}
	if err := q.Order("updated_at desc, id desc").Offset((page - 1) * 50).Limit(50).Find(&conversations).Error; err != nil {
		supportFailure(c, err)
		return
	}
	for i := range conversations {
		count, err := model.SupportUnreadCount(conversations[i].ID, true, conversations[i].StaffReadID)
		if err != nil {
			supportFailure(c, err)
			return
		}
		conversations[i].UnreadCount = count
	}
	common.ApiSuccess(c, gin.H{"items": conversations, "total": total, "counts": counts})
}

func SupportChatAction(c *gin.Context) {
	userID, agentID := c.GetInt("id"), 0
	staff := c.Param("userID") != ""
	if staff {
		var err error
		userID, err = strconv.Atoi(c.Param("userID"))
		if err != nil || userID <= 0 {
			c.AbortWithStatus(400)
			return
		}
		agentID = c.GetInt("id")
	}
	var input struct {
		TargetID  int    `json:"target_id"`
		ThreadID  string `json:"thread_id"`
		Action    string `json:"action"`
		Body      string `json:"body"`
		RequestID string `json:"request_id"`
		Version   *int64 `json:"version"`
		Through   int64  `json:"through"`
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 20<<10)
	if c.ShouldBindJSON(&input) != nil {
		c.AbortWithStatus(400)
		return
	}
	if input.ThreadID != "" && input.ThreadID != model.SupportThreadID(userID) {
		if _, err := uuid.Parse(input.ThreadID); err != nil {
			c.AbortWithStatus(400)
			return
		}
	}
	if input.Action == "read" {
		if err := model.MarkSupportRead(userID, staff, input.Through, input.ThreadID); err != nil {
			supportFailure(c, err)
			return
		}
		common.ApiSuccess(c, nil)
		return
	}
	allowed := input.Action == "send" || input.Action == "handoff" || input.Action == "reopen"
	if staff {
		allowed = input.Action == "reply" || input.Action == "claim" || input.Action == "resolve" || input.Action == "reopen" || input.Action == "note" || input.Action == "transfer"
	}
	if !allowed {
		c.AbortWithStatus(400)
		return
	}
	input.Body = strings.TrimSpace(input.Body)
	if input.Action == "send" || input.Action == "reply" || input.Action == "note" {
		if input.Body == "" || len(input.Body) > 8000 {
			c.AbortWithStatus(400)
			return
		}
		if _, err := uuid.Parse(input.RequestID); err != nil {
			c.AbortWithStatus(400)
			return
		}
	} else {
		input.Body = ""
	}
	if staff && input.Action != "reply" && input.Action != "note" && input.Version == nil {
		c.AbortWithStatus(400)
		return
	}
	if input.Action == "transfer" {
		var target model.User
		if err := model.DB.Select("id", "role", "status").First(&target, input.TargetID).Error; err != nil || target.Status != common.UserStatusEnabled || !authz.Can(target.Id, target.Role, authz.SupportOperate) {
			c.AbortWithStatus(http.StatusForbidden)
			return
		}
	}
	s, err := model.GetSupportSettings()
	if err != nil {
		supportFailure(c, err)
		return
	}
	if !s.Enabled && !staff {
		c.AbortWithStatus(http.StatusServiceUnavailable)
		return
	}
	conversation, inserted, err := model.UpdateSupportWithTarget(userID, agentID, input.TargetID, input.Version, input.Action, input.Body, input.RequestID, input.ThreadID)
	if err != nil {
		supportFailure(c, err)
		return
	}
	if conversation.Status != "ai" {
		service.CancelSupportReply(userID, input.ThreadID)
	}
	if inserted && input.Action == "send" && conversation.Status == "ai" {
		service.StartSupportReply(userID, conversation.Version, input.RequestID, conversation.ID)
	}
	common.ApiSuccess(c, nil)
}

// Streams short-lived revision notifications. Reconnect revalidates session and
// permission, while snapshots are authoritative after disconnects or restarts.
func SupportChatEvents(c *gin.Context) {
	userID := c.GetInt("id")
	staff := c.Query("staff") == "true"
	if staff && !authz.Can(userID, c.GetInt("role"), authz.SupportOperate) {
		c.AbortWithStatus(403)
		return
	}
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-store")
	c.Header("X-Accel-Buffering", "no")
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()
	deadline := time.NewTimer(25 * time.Second)
	defer deadline.Stop()
	last := ""
	var revisions []model.SupportThread
	var nextSnapshot time.Time
	for {
		if !time.Now().Before(nextSnapshot) {
			q := model.DB.Select("id", "version", "status", "user_read_id", "staff_read_id")
			if staff {
				if !authz.Can(userID, c.GetInt("role"), authz.SupportOperate) {
					return
				}
			} else {
				q = q.Where("user_id = ?", userID)
			}
			err := q.Order("id").Find(&revisions).Error
			if err != nil {
				return
			}
			nextSnapshot = time.Now().Add(2 * time.Second)
		}
		drafts := make(map[string]*string)
		for _, thread := range revisions {
			if preview := service.SupportReplyPreview(thread); preview != nil {
				drafts[thread.ID] = preview
			}
		}
		encoded, err := common.Marshal(gin.H{"threads": revisions, "drafts": drafts})
		if err != nil {
			return
		}
		revision := string(encoded)
		if revision != last {
			c.SSEvent("revision", revision)
			c.Writer.Flush()
			last = revision
		}
		select {
		case <-c.Request.Context().Done():
			return
		case <-deadline.C:
			return
		case <-ticker.C:
		}
	}
}

func supportFailure(c *gin.Context, err error) {
	if errors.Is(err, gorm.ErrRecordNotFound) {
		c.AbortWithStatus(404)
		return
	}
	if errors.Is(err, model.ErrSupportConflict) {
		c.JSON(409, gin.H{"success": false, "message": "Support conversation changed. Please refresh and retry."})
		return
	}
	common.SysError("support storage operation failed: " + err.Error())
	c.JSON(500, gin.H{"success": false, "message": "Support is temporarily unavailable."})
}

// SupportChatOrders explicitly returns only the signed-in user's display data.
func SupportChatOrders(c *gin.Context) {
	userID := c.GetInt("id")
	if c.Param("userID") != "" {
		if c.GetInt("role") < common.RoleAdminUser {
			c.AbortWithStatus(403)
			return
		}
		id, err := strconv.Atoi(c.Param("userID"))
		if err != nil || id <= 0 {
			c.AbortWithStatus(400)
			return
		}
		userID = id
	}
	orders, _, err := model.ListSiteOrders(model.SiteOrderFilter{OwnerID: userID, Page: 1, PageSize: 5})
	if err != nil {
		supportFailure(c, err)
		return
	}
	result := make([]gin.H, 0, len(orders))
	for _, order := range orders {
		result = append(result, gin.H{"trade_no": order.TradeNo, "order_status": order.OrderStatus, "close_reason": order.CloseReason, "payment_provider": order.PaymentProvider, "cancel_requested": order.CancelRequested, "close_requested_at": order.CloseRequestedAt, "cancellation_state": order.CancellationState, "review_resolution": order.ReviewResolution, "cache_pending": order.CachePending, "review_required": order.ReviewRequired})
	}
	common.ApiSuccess(c, result)
}

func SupportChatConversations(c *gin.Context) {
	page, _ := strconv.Atoi(c.Query("page"))
	page = max(1, min(page, 10000))
	items := []model.SupportThread{}
	q := model.DB.Model(&model.SupportThread{}).Where("user_id = ?", c.GetInt("id"))
	var total int64
	if err := q.Count(&total).Error; err != nil {
		supportFailure(c, err)
		return
	}
	if err := q.Order("updated_at desc, id desc").Offset((page - 1) * 50).Limit(50).Find(&items).Error; err != nil {
		supportFailure(c, err)
		return
	}
	for i := range items {
		count, err := model.SupportUnreadCount(items[i].ID, false, items[i].UserReadID)
		if err != nil {
			supportFailure(c, err)
			return
		}
		items[i].UnreadCount = count
	}
	common.ApiSuccess(c, gin.H{"items": items, "total": total})
}

// Return a deliberately small profile, never the complete account model.
func SupportChatProfile(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("userID"))
	if err != nil || id <= 0 {
		c.AbortWithStatus(400)
		return
	}
	var user model.User
	if err := model.DB.Select("id", "username", "display_name", "email", "status").First(&user, id).Error; err != nil {
		supportFailure(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"id": user.Id, "username": user.Username, "display_name": user.DisplayName, "email": user.Email, "status": user.Status, "can_view_orders": c.GetInt("role") >= common.RoleAdminUser})
}

func SupportChatAgents(c *gin.Context) {
	var users []model.User
	if err := model.DB.Select("id", "username", "display_name", "role").Where("role >= ? AND status = ?", common.RoleAdminUser, common.UserStatusEnabled).Find(&users).Error; err != nil {
		supportFailure(c, err)
		return
	}
	result := []gin.H{}
	for _, user := range users {
		if authz.Can(user.Id, user.Role, authz.SupportOperate) {
			result = append(result, gin.H{"id": user.Id, "name": user.DisplayName, "username": user.Username})
		}
	}
	common.ApiSuccess(c, result)
}
