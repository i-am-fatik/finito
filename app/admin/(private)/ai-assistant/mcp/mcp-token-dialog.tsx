"use client";

import { CopyIcon } from "lucide-react";
import type React from "react";
import { useTranslation } from "react-i18next";
import type { CreatedAgent } from "@/app/admin/(private)/ai-assistant/mcp/mcp-agent-form";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useClipboard } from "@/hooks/use-clipboard";
import { claudeCodeCommand, claudeDesktopConfig } from "@/lib/mcp/connection";

export type { CreatedAgent };

const Snippet: React.FC<{
	label: string;
	value: string;
	copyLabel: string;
	onCopy: (value: string) => unknown;
}> = (props) => (
	<div className="space-y-1">
		<div className="flex items-center justify-between gap-2">
			<span className="text-sm font-medium">{props.label}</span>
			<Button
				type="button"
				variant="outline"
				size="sm"
				onClick={() => void props.onCopy(props.value)}
			>
				<CopyIcon />
				{props.copyLabel}
			</Button>
		</div>
		<pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 text-xs">
			{props.value}
		</pre>
	</div>
);

export const McpTokenDialog: React.FC<{
	agent: CreatedAgent | null;
	port: number;
	onClose: () => void;
}> = (props) => {
	const { t } = useTranslation();
	const { copy } = useClipboard();
	const copyLabel = t("settings:mcp.token.copy");

	return (
		<Dialog
			open={props.agent !== null}
			onOpenChange={(open) => {
				if (!open) {
					props.onClose();
				}
			}}
		>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>
						{t("settings:mcp.token.title", { label: props.agent?.label ?? "" })}
					</DialogTitle>
					<DialogDescription>
						{t("settings:mcp.token.showOnce")}
					</DialogDescription>
				</DialogHeader>
				{props.agent && (
					<div className="space-y-4">
						<Snippet
							label={t("settings:mcp.token.token")}
							value={props.agent.token}
							copyLabel={copyLabel}
							onCopy={copy}
						/>
						<Snippet
							label={t("settings:mcp.token.claudeCode")}
							value={claudeCodeCommand({
								port: props.port,
								token: props.agent.token,
							})}
							copyLabel={copyLabel}
							onCopy={copy}
						/>
						<Snippet
							label={t("settings:mcp.token.claudeDesktop")}
							value={claudeDesktopConfig({
								port: props.port,
								token: props.agent.token,
							})}
							copyLabel={copyLabel}
							onCopy={copy}
						/>
					</div>
				)}
				<DialogFooter>
					<DialogClose render={<Button variant="outline" />}>
						{t("settings:mcp.token.done")}
					</DialogClose>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
