package model

import (
	"errors"
	"github.com/QuantumNous/new-api/pkg/paymentsecret"
	"os"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// These documents use the existing option table; no schema migration is needed.
const SupportKnowledgeKey = "SupportKnowledge"
const SupportAIConfigKey = "SupportAIConfig"

type SupportArticle struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Content   string `json:"content"`
	Published bool   `json:"published"`
}

type SupportKnowledge struct {
	Revision int64            `json:"revision"`
	Articles []SupportArticle `json:"articles"`
}

type SupportAIConfig struct {
	DailyLimitEnabled bool   `json:"daily_limit_enabled"`
	BaseURL           string `json:"base_url"`
	APIKeyCipher      string `json:"api_key_cipher,omitempty"`
	Revision          int64  `json:"revision"`
	Enabled           bool   `json:"enabled"`
	Model             string `json:"model"`
	DailyRequests     int    `json:"daily_requests"`
	WelcomeMessage    string `json:"welcome_message"`
}

func ReadSupportDocument(key string, destination any) error {
	var option Option
	err := DB.Where(&Option{Key: key}).First(&option).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	return common.UnmarshalJsonStr(option.Value, destination)
}

// Compare the stored revision in a transaction, rejecting concurrent editor saves.
func SaveSupportDocument(key string, revision int64, document any) error {
	encoded, err := common.Marshal(document)
	if err != nil {
		return err
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&Option{Key: key, Value: `{"revision":0}`}).Error; err != nil {
			return err
		}
		var old Option
		if err := lockForUpdate(tx).Where(&Option{Key: key}).First(&old).Error; err != nil {
			return err
		}
		var header struct {
			Revision int64 `json:"revision"`
		}
		if err := common.UnmarshalJsonStr(old.Value, &header); err != nil {
			return err
		}
		if header.Revision != revision {
			return ErrSupportConflict
		}
		result := tx.Model(&Option{}).Where(&Option{Key: key}).Where("value = ?", old.Value).Update("value", string(encoded))
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrSupportConflict
		}
		return nil
	})
}

func GetSupportAIConfig() (SupportAIConfig, error) {
	config := SupportAIConfig{Enabled: true, DailyRequests: 200, BaseURL: os.Getenv("SUPPORT_AI_BASE_URL")}
	err := ReadSupportDocument(SupportAIConfigKey, &config)
	return config, err
}

// Reserve before contacting the provider; failed calls count too. The shared
// database makes the request ceiling survive restarts and multiple instances.
func ReserveSupportAIRequest(limit int) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		const key = "SupportAIDailyUsage"
		if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&Option{Key: key, Value: `{}`}).Error; err != nil {
			return err
		}
		var old Option
		if err := lockForUpdate(tx).Where(&Option{Key: key}).First(&old).Error; err != nil {
			return err
		}
		var usage struct {
			Day   string `json:"day"`
			Count int    `json:"count"`
		}
		if err := common.UnmarshalJsonStr(old.Value, &usage); err != nil {
			return err
		}
		today := time.Now().UTC().Format("2006-01-02")
		if usage.Day != today {
			usage.Day = today
			usage.Count = 0
		}
		if limit <= 0 || usage.Count >= limit {
			return errors.New("support AI daily request limit reached")
		}
		usage.Count++
		encoded, err := common.Marshal(usage)
		if err != nil {
			return err
		}
		result := tx.Model(&Option{}).Where(&Option{Key: key}).Where("value = ?", old.Value).Update("value", string(encoded))
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrSupportConflict
		}
		return nil
	})
}

// The existing server keyring encrypts credentials; plaintext never enters SQL.
func (config SupportAIConfig) APIKey() (string, error) {
	if config.APIKeyCipher != "" {
		ring, err := paymentsecret.Load()
		if err != nil {
			return "", err
		}
		return ring.Open(config.APIKeyCipher, "support/ai/api_key")
	}
	if strings.TrimRight(config.BaseURL, "/") == strings.TrimRight(os.Getenv("SUPPORT_AI_BASE_URL"), "/") {
		return os.Getenv("SUPPORT_AI_API_KEY"), nil
	}
	return "", nil
}
