import type { AiAgentScope } from "@/lib/evolu/model/ai-agent";

export const scopeLabelKeys = {
	catalog_read: "settings:mcp.scopes.catalog_read",
	catalog_write: "settings:mcp.scopes.catalog_write",
	pos_read: "settings:mcp.scopes.pos_read",
	pos_write: "settings:mcp.scopes.pos_write",
	payments_read: "settings:mcp.scopes.payments_read",
	payments_write: "settings:mcp.scopes.payments_write",
	contacts_read: "settings:mcp.scopes.contacts_read",
	settings_write: "settings:mcp.scopes.settings_write",
} as const satisfies Record<AiAgentScope, string>;
