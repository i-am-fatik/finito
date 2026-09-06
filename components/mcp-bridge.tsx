"use client";

import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useAtomValue } from "jotai";
import { useEffect, useMemo, useRef } from "react";
import { accountAtom, hasDeviceAccountAtom } from "@/atoms/account";
import { useEvolu } from "@/hooks/use-evolu";
import { useNostr } from "@/hooks/use-nostr";
import { readDiagnostics } from "@/lib/diagnostics/collector";
import { setAppLanguage } from "@/lib/i18n/client";
import {
	handleMcpHttpRequest,
	type McpHttpRequest,
	type McpHttpResponse,
} from "@/lib/mcp/server";

const requestEvent = "mcp-http-request";

const failedResponse: McpHttpResponse = {
	status: 500,
	headers: [["content-type", "application/json"]],
	body: JSON.stringify({
		jsonrpc: "2.0",
		error: { code: -32603, message: "Internal error." },
		id: null,
	}),
};

const McpBridgeListener = () => {
	const evolu = useEvolu();
	const { ndk } = useNostr();
	const account = useAtomValue(accountAtom);
	const handler = useMemo(
		() =>
			handleMcpHttpRequest({
				evolu,
				ndk,
				deviceId: account.device.id,
				setLanguage: setAppLanguage,
				readDiagnostics,
			}),
		[evolu, ndk, account.device.id],
	);
	const latestHandler = useRef(handler);

	useEffect(() => {
		latestHandler.current = handler;
	}, [handler]);

	useEffect(() => {
		if (!isTauri()) {
			return;
		}
		let active = true;
		const listening = listen<McpHttpRequest>(requestEvent, async (event) => {
			const response = await latestHandler
				.current(event.payload)
				.catch(() => failedResponse);
			await invoke("mcp_http_respond", {
				id: event.payload.id,
				...response,
			}).catch(() => undefined);
		});
		void listening.then(() =>
			active ? invoke("mcp_webview_ready", { ready: true }) : undefined,
		);

		return () => {
			active = false;
			void invoke("mcp_webview_ready", { ready: false });
			void listening.then((unlisten) => unlisten());
		};
	}, []);

	return null;
};

export const McpBridge = () => {
	const hasAccount = useAtomValue(hasDeviceAccountAtom);

	return hasAccount ? <McpBridgeListener /> : null;
};
