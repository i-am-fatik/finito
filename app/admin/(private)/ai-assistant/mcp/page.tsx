"use client";

import { invoke, isTauri } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { McpAgentForm } from "@/app/admin/(private)/ai-assistant/mcp/mcp-agent-form";
import { McpAgentsTable } from "@/app/admin/(private)/ai-assistant/mcp/mcp-agents-table";
import {
	McpEndpointCard,
	type McpEndpointStatus,
} from "@/app/admin/(private)/ai-assistant/mcp/mcp-endpoint-card";
import {
	type CreatedAgent,
	McpTokenDialog,
} from "@/app/admin/(private)/ai-assistant/mcp/mcp-token-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { defaultMcpPort } from "@/lib/mcp/connection";

export default function Home() {
	const { t } = useTranslation();
	const [status, setStatus] = useState<McpEndpointStatus>({ kind: "loading" });
	const [createdAgent, setCreatedAgent] = useState<CreatedAgent | null>(null);

	useEffect(() => {
		if (!isTauri()) {
			setStatus({ kind: "browser" });
			return;
		}
		invoke<{ listening: boolean; port: number }>("mcp_listener_status")
			.then((listener) => setStatus({ kind: "desktop", ...listener }))
			.catch(() =>
				setStatus({ kind: "desktop", listening: false, port: defaultMcpPort }),
			);
	}, []);

	return (
		<div className="w-full max-w-4xl space-y-4">
			<McpEndpointCard status={status} />
			<Card>
				<CardHeader>
					<CardTitle>{t("settings:mcp.agents.title")}</CardTitle>
				</CardHeader>
				<CardContent>
					<McpAgentsTable />
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>{t("settings:mcp.newAgent.title")}</CardTitle>
				</CardHeader>
				<CardContent>
					<McpAgentForm onCreated={setCreatedAgent} />
				</CardContent>
			</Card>
			<McpTokenDialog
				agent={createdAgent}
				port={status.kind === "desktop" ? status.port : defaultMcpPort}
				onClose={() => setCreatedAgent(null)}
			/>
		</div>
	);
}
