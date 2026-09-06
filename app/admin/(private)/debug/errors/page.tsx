"use client";

import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { SubNavShellContent } from "@/components/sub-nav-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useClipboard } from "@/hooks/use-clipboard";
import {
	clearDiagnostics,
	type DiagnosticEvent,
	formatDiagnostics,
	readDiagnostics,
	subscribeDiagnostics,
} from "@/lib/diagnostics/collector";
import { formatDateTime } from "@/lib/shared/utils/format";

const noEvents: ReadonlyArray<DiagnosticEvent> = [];

export default function Page() {
	const { t } = useTranslation();
	const { copy } = useClipboard();
	const events = useSyncExternalStore(
		subscribeDiagnostics,
		readDiagnostics,
		() => noEvents,
	);

	return (
		<SubNavShellContent
			title={t("admin:dashboard.consoleErrors")}
			actions={
				<div className="flex gap-2">
					<Button
						variant="outline"
						size="sm"
						disabled={events.length === 0}
						onClick={() => void copy(formatDiagnostics(events))}
					>
						{t("admin:debug.errors.copy")}
					</Button>
					<Button
						variant="outline"
						size="sm"
						disabled={events.length === 0}
						onClick={clearDiagnostics}
					>
						{t("admin:debug.errors.clear")}
					</Button>
				</div>
			}
		>
			{events.length === 0 ? (
				<p className="px-2 text-muted-foreground text-sm">
					{t("admin:debug.errors.empty")}
				</p>
			) : (
				<ul className="flex flex-col gap-3 px-2">
					{events.map((event) => (
						<li key={event.id} className="rounded-md border border-border p-3">
							<div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
								<Badge
									variant={event.level === "error" ? "destructive" : "outline"}
								>
									{event.level}
								</Badge>
								<span>{formatDateTime(new Date(event.at))}</span>
								<span>{event.source}</span>
								<span>{event.page}</span>
								{event.count > 1 && (
									<span>
										{t("admin:debug.errors.repeated", { times: event.count })}
									</span>
								)}
							</div>
							<pre className="mt-2 whitespace-pre-wrap break-words font-mono text-xs">
								{event.message}
							</pre>
						</li>
					))}
				</ul>
			)}
		</SubNavShellContent>
	);
}
