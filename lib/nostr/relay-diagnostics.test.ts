import { describe, expect, it, jest } from "bun:test";
import {
	nostrEoseQuestion,
	type ProbeRelayDeps,
	probeRelay,
	type RelaySocket,
} from "@/lib/nostr/relay-diagnostics";

const flushMicrotasks = async () => {
	for (let tick = 0; tick < 5; tick += 1) {
		await Promise.resolve();
	}
};

const eoseFor = (payload: string) => {
	const [, subscriptionId] = JSON.parse(payload) as [string, string];
	return JSON.stringify(["EOSE", subscriptionId]);
};

const createRelay = () => {
	const sent: string[] = [];
	let handlers: Parameters<RelaySocket["listen"]>[0] | null = null;
	let closed = false;
	let ticks = 0;

	const socket: RelaySocket = {
		send: (payload) => {
			sent.push(payload);
		},
		close: () => {
			closed = true;
		},
		listen: (given) => {
			handlers = given;
		},
	};

	return {
		sent,
		wasClosed: () => closed,
		deps: {
			openSocket: () => socket,
			now: () => {
				ticks += 10;
				return ticks;
			},
		} satisfies ProbeRelayDeps,
		connect: () => handlers?.open(),
		answer: (payload?: string) => {
			handlers?.message(payload ?? eoseFor(sent[0] ?? "[]"));
		},
		refuse: (reason: string) => handlers?.error(reason),
	};
};

describe("probeRelay", () => {
	it("times how long the relay takes to answer", async () => {
		const relay = createRelay();
		const probe = probeRelay(relay.deps)("wss://relay.example", {
			question: nostrEoseQuestion,
		});

		relay.connect();
		relay.answer();

		expect(await probe).toEqual({
			url: "wss://relay.example",
			connectMs: 10,
			answerMs: 20,
			error: null,
		});
	});

	it("asks the relay for one note", async () => {
		const relay = createRelay();
		const probe = probeRelay(relay.deps)("wss://relay.example", {
			question: nostrEoseQuestion,
		});

		relay.connect();
		relay.answer();
		await probe;

		expect(JSON.parse(relay.sent[0] ?? "[]")).toEqual([
			"REQ",
			"finito-relay-probe",
			{ kinds: [1], limit: 1 },
		]);
	});

	it("hangs up once it has its answer", async () => {
		const relay = createRelay();
		const probe = probeRelay(relay.deps)("wss://relay.example", {
			question: nostrEoseQuestion,
		});

		relay.connect();
		relay.answer();
		await probe;

		expect(relay.wasClosed()).toBe(true);
	});

	it("ignores chatter that is not its own end of stream", async () => {
		const relay = createRelay();
		let answered = false;
		const probe = probeRelay(relay.deps)("wss://relay.example", {
			question: nostrEoseQuestion,
		});
		void probe.then(() => {
			answered = true;
		});

		relay.connect();
		relay.answer(JSON.stringify(["EOSE", "somebody-else"]));
		relay.answer(JSON.stringify(["EVENT", "finito-relay-probe", { id: "a" }]));
		relay.answer("not json at all");
		await flushMicrotasks();

		expect(answered).toBe(false);

		relay.answer();
		await probe;

		expect(answered).toBe(true);
	});

	it("reports a relay that refuses the connection", async () => {
		const relay = createRelay();
		const probe = probeRelay(relay.deps)("wss://relay.example", {
			question: nostrEoseQuestion,
		});

		relay.refuse("connection failed");

		expect(await probe).toMatchObject({
			connectMs: null,
			answerMs: null,
			error: "connection failed",
		});
	});

	it("keeps the connect time of a relay that never answers", async () => {
		jest.useFakeTimers();
		const relay = createRelay();
		const probe = probeRelay(relay.deps)("wss://relay.example", {
			question: nostrEoseQuestion,
			timeoutMs: 1_000,
		});

		relay.connect();
		jest.advanceTimersByTime(1_000);
		jest.useRealTimers();

		expect(await probe).toMatchObject({
			connectMs: 10,
			answerMs: null,
			error: "timeout",
		});
	});

	it("stops at the handshake when it has nothing to ask", async () => {
		const relay = createRelay();
		const probe = probeRelay(relay.deps)("wss://sync.example");

		relay.connect();

		expect(await probe).toEqual({
			url: "wss://sync.example",
			connectMs: 10,
			answerMs: null,
			error: null,
		});
		expect(relay.sent).toHaveLength(0);
	});
});
