package authz

var SupportOperate = Permission{Resource: "support", Action: ActionOperate}

var SupportKnowledgeWrite = Permission{Resource: "support", Action: ActionWrite}
var SupportConfigure = Permission{Resource: "support", Action: ActionSensitiveWrite}

func init() {
	RegisterResource(ResourceDefinition{Resource: "support", LabelKey: "Customer support", Actions: []ActionDefinition{
		{Action: ActionOperate, LabelKey: "Support workbench", DescriptionKey: "Read and reply to customer support conversations", DefaultRoles: []string{BuiltInRoleAdmin}},
		{Action: ActionWrite, LabelKey: "Support knowledge base", DescriptionKey: "Manage and publish support articles"},
		{Action: ActionSensitiveWrite, LabelKey: "Support settings", DescriptionKey: "Configure support AI and service settings"},
	}})
}
