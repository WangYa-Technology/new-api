package model

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"

	"github.com/google/uuid"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// SupportConversation is the legacy per-user record, retained for migration.
type SupportConversation struct {
	UserID        int    `json:"user_id" gorm:"primaryKey;autoIncrement:false"`
	Status        string `json:"status" gorm:"type:varchar(16);index"`
	AgentID       int    `json:"agent_id"`
	Version       int64  `json:"version"`
	LastMessageID int64  `json:"last_message_id"`
	UserReadID    int64  `json:"user_read_id"`
	StaffReadID   int64  `json:"staff_read_id"`
	UpdatedAt     int64  `json:"updated_at" gorm:"index"`
}

type SupportThread struct {
	UnreadCount   int64  `json:"unread_count" gorm:"-"`
	WaitingSince  int64  `json:"waiting_since"`
	ID            string `json:"id" gorm:"type:varchar(64);primaryKey"`
	UserID        int    `json:"user_id" gorm:"index"`
	Title         string `json:"title" gorm:"type:text"`
	Preview       string `json:"preview" gorm:"type:text"`
	Status        string `json:"status" gorm:"type:varchar(16);index"`
	AgentID       int    `json:"agent_id"`
	Version       int64  `json:"version"`
	LastMessageID int64  `json:"last_message_id"`
	UserReadID    int64  `json:"user_read_id"`
	StaffReadID   int64  `json:"staff_read_id"`
	UpdatedAt     int64  `json:"updated_at" gorm:"index"`
}

type SupportMessage struct {
	ActorID   int    `json:"actor_id"`
	TargetID  int    `json:"target_id,omitempty"`
	ID        int64  `json:"id" gorm:"primaryKey"`
	ThreadID  string `json:"thread_id" gorm:"type:varchar(64);index"`
	UserID    int    `json:"user_id" gorm:"uniqueIndex:idx_support_request,priority:1;index"`
	RequestID string `json:"-" gorm:"type:varchar(80);uniqueIndex:idx_support_request,priority:2"`
	Sender    string `json:"sender" gorm:"type:varchar(16)"`
	Body      string `json:"body" gorm:"type:text"`
	CreatedAt int64  `json:"created_at"`
}

type SupportSettings struct {
	QuickReplies   []string `json:"quick_replies" gorm:"-"`
	ID             int      `json:"-" gorm:"primaryKey;autoIncrement:false"`
	Enabled        bool     `json:"enabled"`
	Knowledge      string   `json:"knowledge" gorm:"type:text"`
	OfflineMessage string   `json:"offline_message" gorm:"type:text"`
}

var ErrSupportConflict = errors.New("support conversation changed; please refresh and retry")

func GetSupportSettings() (SupportSettings, error) {
	s := SupportSettings{ID: 1, Enabled: true, QuickReplies: []string{}}
	if err := DB.First(&s, 1).Error; err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return s, err
	}
	var option Option
	err := DB.Where(&Option{Key: "SupportQuickReplies"}).First(&option).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return s, nil
	}
	if err != nil {
		return s, err
	}
	if err := common.UnmarshalJsonStr(option.Value, &s.QuickReplies); err != nil {
		return s, err
	}
	return s, nil
}

func GetSupportConversation(userID int, threadIDs ...string) (SupportThread, error) {
	c := SupportThread{ID: SupportThreadID(userID, threadIDs...), UserID: userID, Status: "ai"}
	err := DB.First(&c, "user_id = ? AND id = ?", userID, c.ID).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return c, nil
	}
	return c, err
}

func SupportHistory(userID int, before int64, threadIDs ...string) ([]SupportMessage, error) {
	return SupportHistoryForStaff(userID, before, false, threadIDs...)
}

func SupportHistoryForStaff(userID int, before int64, staff bool, threadIDs ...string) ([]SupportMessage, error) {
	messages := []SupportMessage{}
	q := DB.Where("user_id = ? AND thread_id = ?", userID, SupportThreadID(userID, threadIDs...))
	if !staff {
		q = q.Where("sender IN ?", []string{"user", "agent", "ai"})
	}
	if before > 0 {
		q = q.Where("id < ?", before)
	}
	err := q.Order("id desc").Limit(100).Find(&messages).Error
	for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
		messages[i], messages[j] = messages[j], messages[i]
	}
	return messages, err
}

// UpdateSupport serializes messages and transitions with a version check. An AI
// response computed before a handoff cannot be committed after that handoff.
func UpdateSupport(userID, agentID int, expected *int64, action, body, requestID string, threadIDs ...string) (SupportThread, bool, error) {
	return UpdateSupportWithTarget(userID, agentID, 0, expected, action, body, requestID, threadIDs...)
}

func UpdateSupportWithTarget(userID, agentID, targetID int, expected *int64, action, body, requestID string, threadIDs ...string) (SupportThread, bool, error) {
	var conversation SupportThread
	inserted := false
	err := DB.Transaction(func(tx *gorm.DB) error {
		initial := SupportThread{ID: SupportThreadID(userID, threadIDs...), UserID: userID, Status: "ai"}
		if action == "send" || action == "handoff" {
			if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&initial).Error; err != nil {
				return err
			}
		}
		if err := lockForUpdate(tx).First(&conversation, "user_id = ? AND id = ?", userID, initial.ID).Error; err != nil {
			return err
		}
		if body != "" {
			var prior SupportMessage
			err := tx.Where("user_id = ? AND request_id = ?", userID, requestID).First(&prior).Error
			if err == nil {
				sender := "user"
				switch action {
				case "reply":
					sender = "agent"
				case "ai":
					sender = "ai"
				case "note":
					sender = "note"
				}
				if prior.Sender != sender {
					return ErrSupportConflict
				}
				if prior.ThreadID != conversation.ID || prior.Body != body || prior.ActorID != agentID {
					return ErrSupportConflict
				}
				return nil
			}
			if !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
		}
		if expected != nil && conversation.Version != *expected {
			return ErrSupportConflict
		}
		version := conversation.Version
		sender := "user"
		switch action {
		case "send":
			if conversation.Status == "resolved" {
				return ErrSupportConflict
			}
		case "reply":
			if conversation.Status != "human" || conversation.AgentID != agentID {
				return ErrSupportConflict
			}
			sender = "agent"
		case "ai":
			if conversation.Status != "ai" {
				return ErrSupportConflict
			}
			sender = "ai"
		case "handoff":
			if conversation.Status == "human" || conversation.Status == "waiting" {
				return nil
			}
			if conversation.Status != "ai" {
				return ErrSupportConflict
			}
			conversation.Status = "waiting"
			conversation.WaitingSince = time.Now().Unix()
			// Deterministic excerpts need no second AI call and cannot delay the queue.
			// This staff-only note is context, not verified account or order information.
			var recent []SupportMessage
			if err := tx.Where("thread_id = ? AND sender IN ?", conversation.ID, []string{"user", "ai", "agent"}).Order("id desc").Limit(6).Find(&recent).Error; err != nil {
				return err
			}
			var summary strings.Builder
			summary.WriteString("Handoff context (unverified conversation excerpts; check the original messages):")
			for i := len(recent) - 1; i >= 0; i-- {
				content := recent[i].Body
				if recent[i].Sender == "ai" {
					var answer struct {
						Answer string `json:"answer"`
					}
					if common.UnmarshalJsonStr(content, &answer) == nil && answer.Answer != "" {
						content = answer.Answer
					}
				}
				runes := []rune(content)
				summary.WriteString("\n" + recent[i].Sender + ": " + string(runes[:min(300, len(runes))]))
			}
			if len(recent) > 0 {
				note := SupportMessage{ThreadID: conversation.ID, UserID: userID, RequestID: "summary:" + uuid.NewString(), Sender: "note", Body: summary.String(), CreatedAt: time.Now().Unix()}
				if err := tx.Create(&note).Error; err != nil {
					return err
				}
			}
		case "reopen":
			if conversation.Status != "resolved" {
				return ErrSupportConflict
			}
			conversation.Status = "waiting"
			conversation.AgentID = 0
			conversation.WaitingSince = time.Now().Unix()
		case "note":
			if conversation.Status != "human" || conversation.AgentID != agentID {
				return ErrSupportConflict
			}
			sender = "note"
		case "transfer":
			if conversation.Status != "human" || conversation.AgentID != agentID || targetID <= 0 || targetID == agentID {
				return ErrSupportConflict
			}
			conversation.AgentID = targetID
		case "claim":
			if conversation.Status != "waiting" && conversation.Status != "ai" {
				return ErrSupportConflict
			}
			conversation.Status = "human"
			conversation.AgentID = agentID
			conversation.WaitingSince = 0
		case "resolve":
			if conversation.AgentID != agentID || conversation.Status != "human" {
				return ErrSupportConflict
			}
			conversation.Status = "resolved"
		default:
			return errors.New("invalid support action")
		}
		if body != "" {
			message := SupportMessage{ActorID: agentID, ThreadID: conversation.ID, UserID: userID, RequestID: requestID, Sender: sender, Body: body, CreatedAt: time.Now().Unix()}
			if err := tx.Create(&message).Error; err != nil {
				return err
			}
			if sender != "note" {
				conversation.LastMessageID = message.ID
				if conversation.Title == "" {
					conversation.Title = string([]rune(body)[:min(80, len([]rune(body)))])
				}
				preview := body
				if sender == "ai" {
					var answer struct {
						Answer string `json:"answer"`
					}
					if common.UnmarshalJsonStr(body, &answer) == nil && answer.Answer != "" {
						preview = answer.Answer
					}
				}
				conversation.Preview = string([]rune(preview)[:min(200, len([]rune(preview)))])
			}
			inserted = true
		}
		if body == "" {
			event := SupportMessage{ThreadID: conversation.ID, UserID: userID, ActorID: agentID, TargetID: targetID, RequestID: "event:" + uuid.NewString(), Sender: "event", Body: action, CreatedAt: time.Now().Unix()}
			if err := tx.Create(&event).Error; err != nil {
				return err
			}
		}
		conversation.Version++
		conversation.UpdatedAt = time.Now().Unix()
		result := tx.Model(&SupportThread{}).Where("user_id = ? AND id = ? AND version = ?", userID, conversation.ID, version).Select("title", "preview", "status", "agent_id", "version", "last_message_id", "updated_at", "user_read_id", "staff_read_id", "waiting_since").Updates(&conversation)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrSupportConflict
		}
		return nil
	})
	return conversation, inserted, err
}

func MarkSupportRead(userID int, staff bool, through int64, threadIDs ...string) error {
	column := "user_read_id"
	if staff {
		column = "staff_read_id"
	}
	return DB.Model(&SupportThread{}).Where("user_id = ? AND id = ? AND "+column+" < ? AND last_message_id >= ?", userID, SupportThreadID(userID, threadIDs...), through, through).Update(column, through).Error
}

// SupportThreadID keeps older clients on their original conversation.
func SupportThreadID(userID int, ids ...string) string {
	if len(ids) > 0 && ids[0] != "" {
		return ids[0]
	}
	return fmt.Sprintf("legacy-%d", userID)
}

// MigrateSupportThreads preserves the previous per-user history without changing
// its primary key. The original table remains available for rollback inspection.
func MigrateSupportThreads() error {
	var batch []SupportConversation
	return DB.FindInBatches(&batch, 100, func(tx *gorm.DB, _ int) error {
		for _, legacy := range batch {
			err := DB.Transaction(func(tx *gorm.DB) error {
				thread := SupportThread{ID: SupportThreadID(legacy.UserID), UserID: legacy.UserID, Status: legacy.Status, AgentID: legacy.AgentID, Version: legacy.Version, LastMessageID: legacy.LastMessageID, UserReadID: legacy.UserReadID, StaffReadID: legacy.StaffReadID, UpdatedAt: legacy.UpdatedAt}
				var messages []SupportMessage
				if err := tx.Where("user_id = ?", legacy.UserID).Order("id asc").Limit(1).Find(&messages).Error; err != nil {
					return err
				}
				if len(messages) > 0 {
					body := []rune(messages[0].Body)
					thread.Title = string(body[:min(80, len(body))])
				}
				messages = nil
				if err := tx.Where("id = ?", legacy.LastMessageID).Find(&messages).Error; err != nil {
					return err
				}
				if len(messages) > 0 {
					body := []rune(messages[0].Body)
					thread.Preview = string(body[:min(200, len(body))])
				}
				if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&thread).Error; err != nil {
					return err
				}
				return tx.Model(&SupportMessage{}).Where("user_id = ? AND (thread_id IS NULL OR thread_id = ?)", legacy.UserID, "").Update("thread_id", thread.ID).Error
			})
			if err != nil {
				return err
			}
		}
		return nil
	}).Error
}

// Recover persisted unanswered user messages after a process crash or an
// interrupted model job. An idle AI conversation whose last reply was delivered
// is deliberately left untouched.
func RecoverSupportReplies(userID int) error {
	now := time.Now().Unix()
	pending := DB.Model(&SupportMessage{}).Select("id").Where("sender = ?", "user")
	q := DB.Model(&SupportThread{}).Where("status = ? AND updated_at < ? AND last_message_id IN (?)", "ai", now-120, pending)
	if userID > 0 {
		q = q.Where("user_id = ?", userID)
	}
	return q.Updates(map[string]any{"status": "waiting", "waiting_since": now, "updated_at": now, "version": gorm.Expr("version + 1")}).Error
}

func SupportUnreadCount(threadID string, staff bool, through int64) (int64, error) {
	senders := []string{"ai", "agent"}
	if staff {
		senders = []string{"user"}
	}
	var count int64
	err := DB.Model(&SupportMessage{}).Where("thread_id = ? AND sender IN ? AND id > ?", threadID, senders, through).Count(&count).Error
	return count, err
}
