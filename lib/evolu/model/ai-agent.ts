import type { InferEnumType } from "@/lib/shared/types";

export const AiAgentScope = {
	CatalogRead: "catalog_read",
	CatalogWrite: "catalog_write",
	PosRead: "pos_read",
	PosWrite: "pos_write",
	PaymentsRead: "payments_read",
	PaymentsWrite: "payments_write",
	ContactsRead: "contacts_read",
	SettingsWrite: "settings_write",
	DiagnosticsRead: "diagnostics_read",
} as const;
export type AiAgentScope = InferEnumType<typeof AiAgentScope>;

export const aiAgentScopes = Object.values(AiAgentScope);
