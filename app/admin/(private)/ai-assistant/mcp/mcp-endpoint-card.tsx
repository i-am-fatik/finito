"use client";

import { useAtomValue } from "jotai";
import type React from "react";
import { useTranslation } from "react-i18next";
import { accountAtom } from "@/atoms/account";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { mcpEndpointUrl } from "@/lib/mcp/connection";

export type McpEndpointStatus =
	| { kind: "loading" }
	| { kind: "browser" }
	| { kind: "desktop"; listening: boolean; port: number };

export const McpEndpointCard: React.FC<{ status: McpEndpointStatus }> = (
	props,
) => {
	const { t } = useTranslation();
	const account = useAtomValue(accountAtom);

	return (
		<Card>
			<CardHeader>
				<CardTitle>{t("settings:mcp.endpoint.title")}</CardTitle>
			</CardHeader>
			<CardContent className="space-y-3 text-sm">
				<p>{t("settings:mcp.endpoint.account", { name: account.name })}</p>
				{props.status.kind === "loading" && <Spinner />}
				{props.status.kind === "browser" && (
					<p>{t("settings:mcp.endpoint.desktopOnly")}</p>
				)}
				{props.status.kind === "desktop" &&
					(props.status.listening ? (
						<div className="flex flex-wrap items-center gap-2">
							<Badge>{t("settings:mcp.endpoint.listening")}</Badge>
							<code className="rounded-md bg-muted px-2 py-1">
								{mcpEndpointUrl(props.status.port)}
							</code>
						</div>
					) : (
						<Badge variant="destructive">
							{t("settings:mcp.endpoint.portBusy", {
								port: props.status.port,
							})}
						</Badge>
					))}
				<p className="text-muted-foreground">
					{t("settings:mcp.endpoint.keepOpen")}
				</p>
			</CardContent>
		</Card>
	);
};
