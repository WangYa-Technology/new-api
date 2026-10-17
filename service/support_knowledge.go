package service

import (
	"crypto/sha256"
	"fmt"
	"sort"
	"strings"
	"unicode"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/console_setting"
)

// Public help and AI retrieval deliberately share this source. Draft articles
// and the legacy private knowledge blob are never exposed to either consumer.
func PublishedSupportArticles() ([]model.SupportArticle, error) {
	document := model.SupportKnowledge{Articles: []model.SupportArticle{}}
	if err := model.ReadSupportDocument(model.SupportKnowledgeKey, &document); err != nil {
		return nil, err
	}
	articles := []model.SupportArticle{}
	for _, article := range document.Articles {
		if article.Published {
			articles = append(articles, article)
		}
	}
	if console_setting.GetConsoleSetting().FAQEnabled {
		for _, faq := range console_setting.GetFAQ() {
			title, _ := faq["question"].(string)
			content, _ := faq["answer"].(string)
			if strings.TrimSpace(title) == "" || strings.TrimSpace(content) == "" {
				continue
			}
			articles = append(articles, model.SupportArticle{ID: fmt.Sprintf("faq-%x", sha256.Sum256([]byte(title+"\n"+content))), Title: title, Content: content, Published: true})
		}
	}
	return articles, nil
}

// Lexical retrieval uses words and CJK bigrams, so Chinese queries do not
// depend on whitespace. Only the five best matching public articles are sent.
func RetrieveSupportArticles(question string, articles []model.SupportArticle) []model.SupportArticle {
	terms := map[string]bool{}
	for _, word := range strings.FieldsFunc(strings.ToLower(question), func(r rune) bool { return !unicode.IsLetter(r) && !unicode.IsNumber(r) }) {
		runes := []rune(word)
		if len(runes) < 2 {
			continue
		}
		terms[word] = true
		for i := 0; i+1 < len(runes); i++ {
			if unicode.Is(unicode.Han, runes[i]) && unicode.Is(unicode.Han, runes[i+1]) {
				terms[string(runes[i:i+2])] = true
			}
		}
	}
	type match struct {
		Article model.SupportArticle
		Score   int
	}
	matches := []match{}
	for _, article := range articles {
		title, content := strings.ToLower(article.Title), strings.ToLower(article.Content)
		score := 0
		for term := range terms {
			if strings.Contains(title, term) {
				score += 3
			}
			if strings.Contains(content, term) {
				score++
			}
		}
		if score > 0 {
			matches = append(matches, match{article, score})
		}
	}
	sort.SliceStable(matches, func(i, j int) bool { return matches[i].Score > matches[j].Score })
	result := []model.SupportArticle{}
	for _, m := range matches[:min(5, len(matches))] {
		result = append(result, m.Article)
	}
	return result
}

func SupportNeedsHuman(text string) bool {
	text = strings.ToLower(text)
	for _, phrase := range []string{"转人工", "找人工", "人工客服", "真人客服", "human agent", "human support", "talk to a person", "real person"} {
		if strings.Contains(text, phrase) {
			return true
		}
	}
	return false
}
