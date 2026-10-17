package router

import (
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/service/authz"
	"github.com/gin-gonic/gin"
)

func registerSupportRoutes(router *gin.Engine, api *gin.RouterGroup) {
	group := api.Group("/support-chat", middleware.UserAuth(), middleware.DisableCache())
	group.GET("/info", controller.SupportChatInfo)
	group.GET("/orders", controller.SupportChatOrders)
	group.GET("/conversations", controller.SupportChatConversations)
	group.GET("/history", controller.SupportChatHistory)
	group.POST("/action", middleware.SessionCookieOriginGuard(), middleware.SupportChatRateLimit(false), controller.SupportChatAction)
	handlePermissionRoute(group, "GET", "/settings", authz.SupportConfigure, controller.SupportChatSettings)
	handlePermissionRoute(group, "PUT", "/settings", authz.SupportConfigure, middleware.SessionCookieOriginGuard(), controller.SupportChatSettings)
	group.GET("/knowledge", controller.SupportPublishedKnowledge)
	handlePermissionRoute(group, "GET", "/knowledge-settings", authz.SupportKnowledgeWrite, controller.SupportKnowledgeSettings)
	handlePermissionRoute(group, "PUT", "/knowledge-settings", authz.SupportKnowledgeWrite, middleware.SessionCookieOriginGuard(), controller.SupportKnowledgeSettings)
	handlePermissionRoute(group, "GET", "/ai-settings", authz.SupportConfigure, controller.SupportAISettings)
	handlePermissionRoute(group, "PUT", "/ai-settings", authz.SupportConfigure, middleware.SessionCookieOriginGuard(), controller.SupportAISettings)

	handlePermissionRoute(group, "GET", "/agents", authz.SupportOperate, controller.SupportChatAgents)
	handlePermissionRoute(group, "GET", "/users/:userID/profile", authz.SupportOperate, controller.SupportChatProfile)
	handlePermissionRoute(group, "GET", "/users/:userID/orders", authz.SupportOperate, controller.SupportChatOrders)
	handlePermissionRoute(group, "GET", "/queue", authz.SupportOperate, controller.SupportChatQueue)
	handlePermissionRoute(group, "GET", "/users/:userID", authz.SupportOperate, controller.SupportChatHistory)
	handlePermissionRoute(group, "POST", "/users/:userID", authz.SupportOperate, middleware.SessionCookieOriginGuard(), middleware.SupportChatRateLimit(true), controller.SupportChatAction)
	// Deliberately outside the gzip group so notifications flush immediately.
	router.GET("/api/support-chat/events", middleware.RouteTag("api"), middleware.GlobalAPIRateLimit(), middleware.UserAuth(), middleware.DisableCache(), controller.SupportChatEvents)
}
