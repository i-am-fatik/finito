"use client";

import { isTauri } from "@tauri-apps/api/core";
import { attachConsole, error, info, warn } from "@tauri-apps/plugin-log";
import { useStore } from "jotai";
import { useEffect } from "react";
import { evoluAtom } from "@/atoms/evolu";

const heartbeatMs = 2000;

const describe = (value: unknown) => {
	if (value instanceof Error) {
		return `${value.name}: ${value.message}\n${value.stack ?? ""}`;
	}
	if (typeof value === "string") {
		return value;
	}
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
};

export const TauriConsoleLog = () => {
	const store = useStore();

	useEffect(() => {
		if (!isTauri()) {
			return;
		}

		let restoreLoadQuery: (() => void) | undefined;
		void store.get(evoluAtom).then((evolu) => {
			const originalLoadQuery = evolu.loadQuery;
			const patched: typeof evolu.loadQuery = (query) => {
				const startedAt = Date.now();
				const sql = String(query).slice(0, 160);
				const pending = setTimeout(() => {
					void warn(`loadQuery pending 5s ${sql}`);
				}, 5000);
				const result = originalLoadQuery(query);
				result.then(
					(rows) => {
						clearTimeout(pending);
						const took = Date.now() - startedAt;
						if (took > 1000) {
							void warn(`loadQuery slow ${took}ms rows=${rows.length} ${sql}`);
						}
					},
					(cause) => {
						clearTimeout(pending);
						void error(`loadQuery rejected ${describe(cause)} ${sql}`);
					},
				);
				return result;
			};
			try {
				Object.defineProperty(evolu, "loadQuery", {
					value: patched,
					configurable: true,
					writable: true,
				});
				restoreLoadQuery = () => {
					Object.defineProperty(evolu, "loadQuery", {
						value: originalLoadQuery,
						configurable: true,
						writable: true,
					});
				};
				void info("loadQuery instrumented");
			} catch (cause) {
				void error(`loadQuery instrumentation failed: ${describe(cause)}`);
			}
		});

		let detach: (() => void) | undefined;
		void attachConsole().then((unlisten) => {
			detach = unlisten;
		});

		const onError = (event: ErrorEvent) => {
			void error(
				`window.error: ${event.message} @ ${event.filename}:${event.lineno}`,
			);
		};
		const onRejection = (event: PromiseRejectionEvent) => {
			void error(`unhandledrejection: ${describe(event.reason)}`);
		};
		window.addEventListener("error", onError);
		window.addEventListener("unhandledrejection", onRejection);

		const onResourceError = (event: Event) => {
			const target = event.target;
			if (
				target instanceof HTMLScriptElement ||
				target instanceof HTMLLinkElement
			) {
				void error(
					`resource.error ${target.tagName.toLowerCase()} ${"src" in target ? target.src : target.href}`,
				);
			}
		};
		window.addEventListener("error", onResourceError, true);

		const originalFetch = window.fetch.bind(window);
		const loggedFetch = async (
			input: RequestInfo | URL,
			init?: RequestInit,
		) => {
			const url =
				typeof input === "string"
					? input
					: input instanceof URL
						? input.href
						: input.url;
			const isLocal = url.startsWith("/") || url.startsWith("tauri://");
			const startedAt = Date.now();
			try {
				const response = await originalFetch(input, init);
				if (isLocal) {
					void info(
						`fetch ${init?.method ?? "GET"} ${response.status} ${Date.now() - startedAt}ms ${url} type=${response.headers.get("content-type") ?? "?"} responseUrl=${response.url} redirected=${String(response.redirected)}`,
					);
				}
				return response;
			} catch (cause) {
				void error(
					`fetch failed ${Date.now() - startedAt}ms ${url}: ${describe(cause)}`,
				);
				throw cause;
			}
		};
		window.fetch = Object.assign(loggedFetch, originalFetch);

		const probes = setTimeout(() => {
			void info("probe start");
			for (const [path, method] of [
				["/admin/pos", "HEAD"],
				["/admin/payments", "HEAD"],
				["/admin/pos/__next._tree.txt", "GET"],
				["/admin/pos.txt", "GET"],
			] as const) {
				void window
					.fetch(path, { method })
					.then((response) => response.text())
					.then((body) =>
						info(`probe ${method} ${path} bodyLength=${body.length}`),
					)
					.catch((cause) =>
						error(`probe ${method} ${path} failed: ${describe(cause)}`),
					);
			}
		}, 6000);

		const originalConsoleError = console.error;
		const originalConsoleWarn = console.warn;
		console.error = (...args: unknown[]) => {
			originalConsoleError(...args);
			void error(`console.error: ${args.map(describe).join(" ")}`);
		};
		console.warn = (...args: unknown[]) => {
			originalConsoleWarn(...args);
			void warn(`console.warn: ${args.map(describe).join(" ")}`);
		};

		const onClick = (event: MouseEvent) => {
			const anchor = (event.target as Element | null)?.closest("a, button");
			if (anchor === null || anchor === undefined) {
				return;
			}
			void info(
				`click ${anchor.tagName.toLowerCase()} ${anchor.getAttribute("href") ?? ""} "${anchor.textContent?.trim().slice(0, 40) ?? ""}"`,
			);
		};
		document.addEventListener("click", onClick, true);

		const originalPushState = history.pushState.bind(history);
		const originalReplaceState = history.replaceState.bind(history);
		history.pushState = (...args) => {
			void info(`history.pushState ${String(args[2] ?? "")}`);
			originalPushState(...args);
		};
		history.replaceState = (...args) => {
			void info(`history.replaceState ${String(args[2] ?? "")}`);
			originalReplaceState(...args);
		};

		let lastBeat = Date.now();
		const heartbeat = setInterval(() => {
			const now = Date.now();
			const late = now - lastBeat - heartbeatMs;
			lastBeat = now;
			void info(
				`heartbeat ${location.pathname}${location.search}${late > 500 ? ` late by ${late}ms` : ""}`,
			);
		}, heartbeatMs);

		return () => {
			clearInterval(heartbeat);
			clearTimeout(probes);
			restoreLoadQuery?.();
			window.removeEventListener("error", onError);
			window.removeEventListener("unhandledrejection", onRejection);
			document.removeEventListener("click", onClick, true);
			window.removeEventListener("error", onResourceError, true);
			window.fetch = originalFetch;
			console.error = originalConsoleError;
			console.warn = originalConsoleWarn;
			history.pushState = originalPushState;
			history.replaceState = originalReplaceState;
			detach?.();
		};
	}, [store]);

	return null;
};
