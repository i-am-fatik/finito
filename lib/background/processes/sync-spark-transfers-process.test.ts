import { beforeEach, describe, expect, it, mock } from "bun:test";
import { createIdFromString } from "@evolu/common";
import type { NotificationUI } from "@/hooks/use-background-processes";
import type { BackgroundProcess } from "@/lib/background/service";
import { type EvoluRow, setupEvolu, writesTo } from "@/lib/test-support/evolu";
import { sparkSdkModuleWith } from "@/lib/test-support/spark";

const accountId = createIdFromString("sparkAccount");
const transferId = "invented-spark-transfer";
const transactionId = createIdFromString(
	`sparkTransfer:${accountId}:${transferId}`,
);
const paymentHash = "ab".repeat(32);
const preimage = "cd".repeat(32);
const lnInvoice = "lnbc1invented";
const occurredAt = new Date("2026-09-11T10:00:00.000Z");

type FakeTransfer = {
	id: string;
	status: string;
	totalValue: number;
	transferDirection: "INCOMING" | "OUTGOING";
	updatedTime: Date;
	userRequest?: unknown;
};

const claimedInvoice = {
	invoice: {
		encodedInvoice: lnInvoice,
		paymentHash: paymentHash.toUpperCase(),
	},
	paymentPreimage: preimage,
};

const completedTransfer = (
	overrides: Partial<FakeTransfer> = {},
): FakeTransfer => ({
	id: transferId,
	status: "TRANSFER_STATUS_COMPLETED",
	totalValue: 21_000,
	transferDirection: "INCOMING",
	updatedTime: occurredAt,
	userRequest: claimedInvoice,
	...overrides,
});

let historyPages: FakeTransfer[][] = [];
let announced = new Map<string, FakeTransfer>();
let announceClaimed: ((transferId: string) => void) | null = null;
let announceStreamConnected: (() => void) | null = null;

const wallet = {
	getTransfers: async () => ({ transfers: historyPages.shift() ?? [] }),
	getTransfer: async (id: string) => announced.get(id),
	off: () => {},
	cleanupConnections: async () => {},
};

const FakeSparkWallet = {
	initialize: async (params: {
		options: { events: Record<string, (value: never) => void> };
	}) => {
		const claimed = params.options.events["transfer:claimed"] as
			| ((id: string) => void)
			| undefined;
		const connected = params.options.events["stream:connected"] as
			| (() => void)
			| undefined;
		announceClaimed = claimed ?? null;
		announceStreamConnected = connected ?? null;

		return { wallet };
	},
};

mock.module("@buildonspark/spark-sdk", sparkSdkModuleWith(FakeSparkWallet));

const { syncSparkTransfersProcess } = await import(
	"@/lib/background/processes/sync-spark-transfers-process"
);

const flushPendingWork = async () => {
	for (let tick = 0; tick < 100; tick += 1) {
		await Promise.resolve();
	}
};

const setupProcess = (params?: { recorded?: EvoluRow[] }) => {
	const evoluFake = setupEvolu({
		rowsFor: (query) => {
			if (query.includes("mnemonic")) {
				return [
					{
						id: accountId,
						_tag: "accountSpark",
						mnemonic: "invented spark mnemonic",
					},
				];
			}
			if (query.includes("occurredAt")) {
				return [];
			}
			if (query.includes("paymentLnSpark")) {
				return [];
			}
			return params?.recorded ?? [];
		},
	});

	const run = () =>
		syncSparkTransfersProcess.run({
			evolu: evoluFake.evolu,
			t: ((key: string) => key) as never,
			addNotification: (_notification: NotificationUI) => ({
				update: () => {},
				delete: () => {},
			}),
		} as unknown as Parameters<BackgroundProcess["run"]>[0]);

	return { ...evoluFake, run };
};

beforeEach(() => {
	historyPages = [];
	announced = new Map();
	announceClaimed = null;
	announceStreamConnected = null;
});

describe("syncSparkTransfersProcess", () => {
	it("books a completed incoming transfer as a bitcoin transaction", async () => {
		historyPages = [[completedTransfer()]];
		const { run, upserts } = setupProcess();

		const stop = await run();
		await flushPendingWork();
		announceStreamConnected?.();
		await flushPendingWork();
		stop();

		expect(writesTo(upserts, "transaction")[0]?.values).toMatchObject({
			id: transactionId,
			accountId,
			_tag: "accountSpark",
			amount: 21_000,
			currency: "BTC",
			occurredAt: occurredAt.getTime(),
		});
	});

	it("books an outgoing transfer as money leaving the wallet", async () => {
		historyPages = [
			[completedTransfer({ transferDirection: "OUTGOING", totalValue: 4_500 })],
		];
		const { run, upserts } = setupProcess();

		const stop = await run();
		await flushPendingWork();
		announceStreamConnected?.();
		await flushPendingWork();
		stop();

		expect(writesTo(upserts, "transaction")[0]?.values).toMatchObject({
			amount: -4_500,
		});
	});

	it("leaves a transfer that has not completed alone", async () => {
		historyPages = [[completedTransfer({ status: "TRANSFER_STATUS_PENDING" })]];
		const { run, upserts } = setupProcess();

		const stop = await run();
		await flushPendingWork();
		announceStreamConnected?.();
		await flushPendingWork();
		stop();

		expect(writesTo(upserts, "transaction")).toHaveLength(0);
	});

	it("keeps the lightning proof of a claimed invoice with the transaction", async () => {
		historyPages = [[completedTransfer()]];
		const { run, upserts } = setupProcess();

		const stop = await run();
		await flushPendingWork();
		announceStreamConnected?.();
		await flushPendingWork();
		stop();

		expect(writesTo(upserts, "transactionSpark")[0]?.values).toMatchObject({
			id: transactionId,
			sparkTransferId: transferId,
			preImage: preimage,
			lnInvoice,
			paymentHash,
		});
	});

	it("books a transfer the wallet announces as claimed", async () => {
		announced.set(transferId, completedTransfer());
		const { run, upserts } = setupProcess();

		const stop = await run();
		await flushPendingWork();
		announceClaimed?.(transferId);
		await flushPendingWork();
		stop();

		expect(writesTo(upserts, "transaction")[0]?.values).toMatchObject({
			id: transactionId,
			amount: 21_000,
		});
	});

	it("books a transfer only once", async () => {
		historyPages = [[completedTransfer()]];
		const { run, upserts } = setupProcess({
			recorded: [{ id: transactionId }],
		});

		const stop = await run();
		await flushPendingWork();
		announceStreamConnected?.();
		await flushPendingWork();
		stop();

		expect(writesTo(upserts, "transaction")).toHaveLength(0);
	});
});
