export type RelaySocket = {
	send: (payload: string) => void;
	close: () => void;
	listen: (handlers: {
		open: () => void;
		message: (data: string) => void;
		error: (reason: string) => void;
	}) => void;
};

export type RelayQuestion = {
	ask: string;
	answers: (data: string) => boolean;
};

export type RelayProbe = {
	url: string;
	connectMs: number | null;
	answerMs: number | null;
	error: string | null;
};

export type ProbeRelayDeps = {
	openSocket: (url: string) => RelaySocket;
	now: () => number;
};

const probeSubscriptionId = "finito-relay-probe";
const defaultTimeoutMs = 5_000;

export const nostrEoseQuestion: RelayQuestion = {
	ask: JSON.stringify(["REQ", probeSubscriptionId, { kinds: [1], limit: 1 }]),
	answers: (data) => {
		try {
			const message: unknown = JSON.parse(data);
			return (
				Array.isArray(message) &&
				message[0] === "EOSE" &&
				message[1] === probeSubscriptionId
			);
		} catch {
			return false;
		}
	},
};

export const probeRelay =
	(deps: ProbeRelayDeps) =>
	(
		url: string,
		options: { question?: RelayQuestion; timeoutMs?: number } = {},
	): Promise<RelayProbe> =>
		new Promise<RelayProbe>((resolve) => {
			const startedAt = deps.now();
			const socket = deps.openSocket(url);
			let connectMs: number | null = null;

			const timer = setTimeout(() => {
				finish({ connectMs, answerMs: null, error: "timeout" });
			}, options.timeoutMs ?? defaultTimeoutMs);

			function finish(probe: Omit<RelayProbe, "url">) {
				clearTimeout(timer);
				socket.close();
				resolve({ url, ...probe });
			}

			socket.listen({
				open: () => {
					connectMs = deps.now() - startedAt;
					if (options.question === undefined) {
						finish({ connectMs, answerMs: null, error: null });
						return;
					}

					socket.send(options.question.ask);
				},
				message: (data) => {
					if (options.question?.answers(data) !== true) {
						return;
					}

					finish({ connectMs, answerMs: deps.now() - startedAt, error: null });
				},
				error: (reason) => {
					finish({ connectMs, answerMs: null, error: reason });
				},
			});
		});

export const webSocketRelaySocket = (url: string): RelaySocket => {
	const socket = new WebSocket(url);

	return {
		send: (payload) => socket.send(payload),
		close: () => socket.close(),
		listen: (handlers) => {
			socket.onopen = () => handlers.open();
			socket.onmessage = (event) => handlers.message(String(event.data));
			socket.onerror = () => handlers.error("connection failed");
			socket.onclose = (event) => {
				if (event.wasClean) {
					return;
				}

				handlers.error("connection closed");
			};
		},
	};
};
