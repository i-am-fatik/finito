"use client";

import {
	evoluJsonArrayFrom,
	type KyselyNotNull,
	sqliteTrue,
} from "@evolu/common";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
	type EditableAgent,
	McpAgentForm,
} from "@/app/admin/(private)/ai-assistant/mcp/mcp-agent-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { useEvolu } from "@/hooks/use-evolu";
import { useEvoluQuery } from "@/hooks/use-evolu-query";
import { useGlobalDialog } from "@/hooks/use-global-dialog";
import { createQuery } from "@/lib/evolu";
import { scopeLabelKeys } from "@/lib/mcp/scope-labels";
import { formatDateTime } from "@/lib/shared/utils/format";

type AgentRow = EditableAgent & {
	lastUsedAt: number | null;
};

const agentsQuery = createQuery((db) =>
	db
		.selectFrom("aiAgent")
		.select((eb) => [
			"aiAgent.id as id",
			"aiAgent.label as label",
			"aiAgent.lastUsedAt as lastUsedAt",
			evoluJsonArrayFrom(
				eb
					.selectFrom("aiAgentScope")
					.select(["aiAgentScope.id as id", "aiAgentScope.scope as scope"])
					.whereRef("aiAgentScope.aiAgentId", "=", "aiAgent.id")
					.where("aiAgentScope.isDeleted", "is not", sqliteTrue)
					.where("aiAgentScope.scope", "is not", null)
					.$narrowType<{ scope: KyselyNotNull }>(),
			).as("scopes"),
		])
		.where("aiAgent.isDeleted", "is not", sqliteTrue)
		.where("aiAgent.label", "is not", null)
		.orderBy("aiAgent.createdAt", "asc")
		.$narrowType<{ label: KyselyNotNull }>(),
);

export const McpAgentsTable = () => {
	const { t } = useTranslation();
	const evolu = useEvolu();
	const { confirm } = useGlobalDialog();
	const { data: agents } = useEvoluQuery(agentsQuery);
	const [editedAgent, setEditedAgent] = useState<AgentRow | null>(null);

	const revoke = async (agent: AgentRow) => {
		const accepted = await confirm({
			title: t("settings:mcp.agents.revokeConfirm.title", {
				label: agent.label,
			}),
			description: t("settings:mcp.agents.revokeConfirm.description"),
			confirmText: t("settings:mcp.agents.revokeConfirm.confirm"),
			confirmVariant: "destructive",
		});
		if (!accepted) {
			return;
		}
		evolu.update("aiAgent", { id: agent.id, isDeleted: sqliteTrue });
		for (const scope of agent.scopes) {
			evolu.update("aiAgentScope", { id: scope.id, isDeleted: sqliteTrue });
		}
	};

	if (agents.length === 0) {
		return (
			<p className="text-sm text-muted-foreground">
				{t("settings:mcp.agents.empty")}
			</p>
		);
	}

	return (
		<>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>{t("settings:mcp.agents.columns.label")}</TableHead>
						<TableHead>{t("settings:mcp.agents.columns.scopes")}</TableHead>
						<TableHead>{t("settings:mcp.agents.columns.lastUsedAt")}</TableHead>
						<TableHead />
					</TableRow>
				</TableHeader>
				<TableBody>
					{agents.map((agent) => (
						<TableRow key={agent.id}>
							<TableCell className="font-medium">{agent.label}</TableCell>
							<TableCell>
								<div className="flex flex-wrap gap-1">
									{agent.scopes.map((grant) => (
										<Badge key={grant.id} variant="secondary">
											{t(scopeLabelKeys[grant.scope])}
										</Badge>
									))}
								</div>
							</TableCell>
							<TableCell>
								{agent.lastUsedAt === null
									? t("settings:mcp.agents.neverUsed")
									: formatDateTime(new Date(agent.lastUsedAt))}
							</TableCell>
							<TableCell className="text-right">
								<div className="flex justify-end gap-2">
									<Button
										variant="outline"
										size="sm"
										onClick={() => setEditedAgent(agent)}
									>
										{t("settings:mcp.agents.edit")}
									</Button>
									<Button
										variant="destructive"
										size="sm"
										onClick={() => void revoke(agent)}
									>
										{t("settings:mcp.agents.revoke")}
									</Button>
								</div>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
			<Dialog
				open={editedAgent !== null}
				onOpenChange={(open) => {
					if (!open) {
						setEditedAgent(null);
					}
				}}
			>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>
							{t("settings:mcp.agents.editDialog.title", {
								label: editedAgent?.label ?? "",
							})}
						</DialogTitle>
						<DialogDescription>
							{t("settings:mcp.agents.editDialog.description")}
						</DialogDescription>
					</DialogHeader>
					{editedAgent && (
						<McpAgentForm
							key={editedAgent.id}
							agent={editedAgent}
							onSaved={() => setEditedAgent(null)}
						/>
					)}
				</DialogContent>
			</Dialog>
		</>
	);
};
