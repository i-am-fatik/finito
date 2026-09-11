import type { BrowserContext } from "@playwright/test";

export const relayPort = 7448;
export const relayUrl = `ws://127.0.0.1:${relayPort}`;

const frameOf = (message: string): unknown[] => {
	const parsed: unknown = JSON.parse(message);
	return Array.isArray(parsed) ? parsed : [];
};

const openSocket = async (url: string) => {
	const socket = new WebSocket(url);
	await new Promise<void>((opened, refused) => {
		socket.onopen = () => {
			opened();
		};
		socket.onerror = () => {
			refused(new Error(`the relay at ${url} refused the connection`));
		};
	});

	return socket;
};

export const nostrRelayAt = (url: string = relayUrl) => {
	const subscriptions = new Set<string>();
	let connections = 0;

	return {
		url,
		subscriptionCount: () => subscriptions.size,
		publish: async (event: { id: string }) => {
			const socket = await openSocket(url);
			const stored = new Promise<void>((accepted, refused) => {
				socket.onmessage = (message) => {
					const frame = frameOf(String(message.data));
					if (frame[0] !== "OK" || frame[1] !== event.id) {
						return;
					}
					if (frame[2] === true) {
						accepted();
						return;
					}
					refused(new Error(`the relay refused ${event.id}: ${String(frame[3])}`));
				};
			});

			socket.send(JSON.stringify(["EVENT", event]));
			await stored;
			socket.close();
		},
		serve: async (context: BrowserContext, serves: (url: URL) => boolean) => {
			await context.routeWebSocket(serves, (route) => {
				const connection = (connections += 1);
				const own = new Set<string>();
				const remember = (subscriptionId: string) => {
					own.add(subscriptionId);
					subscriptions.add(`${connection}:${subscriptionId}`);
				};
				const forget = (subscriptionId: string) => {
					own.delete(subscriptionId);
					subscriptions.delete(`${connection}:${subscriptionId}`);
				};
				const backlog: string[] = [];
				const upstream = new WebSocket(url);
				let connected = false;

				upstream.onopen = () => {
					connected = true;
					for (const frame of backlog) {
						upstream.send(frame);
					}
					backlog.length = 0;
				};
				upstream.onmessage = (message) => {
					route.send(String(message.data));
				};
				upstream.onclose = () => {
					route.close();
				};

				route.onMessage((message) => {
					const sent = String(message);
					const frame = frameOf(sent);
					const subscriptionId = typeof frame[1] === "string" ? frame[1] : null;

					if (frame[0] === "REQ" && subscriptionId !== null) {
						remember(subscriptionId);
					}
					if (frame[0] === "CLOSE" && subscriptionId !== null) {
						forget(subscriptionId);
					}

					if (connected) {
						upstream.send(sent);
						return;
					}
					backlog.push(sent);
				});

				route.onClose(() => {
					for (const subscriptionId of [...own]) {
						forget(subscriptionId);
					}
					upstream.close();
				});
			});
		},
	};
};

export type NostrRelay = ReturnType<typeof nostrRelayAt>;
