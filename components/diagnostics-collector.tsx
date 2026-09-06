"use client";

import { isTauri } from "@tauri-apps/api/core";
import { error as logError, warn as logWarn } from "@tauri-apps/plugin-log";
import { useEffect } from "react";
import {
	type DiagnosticEvent,
	installDiagnosticsCollector,
} from "@/lib/diagnostics/collector";

const mirrorToDesktopLog = (event: DiagnosticEvent) => {
	const line = `${event.source}: ${event.message}`;
	void (event.level === "error" ? logError(line) : logWarn(line)).catch(
		() => undefined,
	);
};

const localStorageOrNull = () => {
	try {
		return window.localStorage;
	} catch {
		return null;
	}
};

export const DiagnosticsCollector = () => {
	useEffect(
		() =>
			installDiagnosticsCollector({
				target: window,
				console,
				storage: localStorageOrNull(),
				page: () => window.location.pathname,
				sink: isTauri() ? mirrorToDesktopLog : undefined,
			}),
		[],
	);

	return null;
};
