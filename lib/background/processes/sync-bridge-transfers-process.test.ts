import { beforeEach, describe, expect, it, jest, mock } from "bun:test";
import { createIdFromString } from "@evolu/common";
import type { NotificationUI } from "@/hooks/use-background-processes";
import type { BackgroundProcess } from "@/lib/background/service";
import { PaymentWatchingStopReason } from "@/lib/evolu/model/payment-watching-state";
import {
	otherPreimageThan,
	testLightningInvoice,
} from "@/lib/test-support/bolt11";
import { type EvoluRow, setupEvolu, writesTo } from "@/lib/test-support/evolu";
import { thunderBridgeModuleWith } from "@/lib/test-support/thunder-bridge";

const accountId = createIdFromString("bridgeAccount");
const paymentId = createIdFromString("bridgePayment");
const transactionId = createIdFromString(`lnBridge:${paymentId}`);
const gatewayPaymentId = "invented-gateway-payment-id";
const preimageSeed = "settled bridge payment";
const amountSats = 600;
const retryDelayMs = 30_000;

const invoice = testLightningInvoice({
	amountSats,
	createdAtSec: Math.floor(Date.now() / 1000),
	expirySeconds: 3600,
	preimageSeed,
});

type GatewayOutcome = {
	status: "paid" | "expired";
	preimage: string | null;
};

let waitCalls: Array<{ paymentId: string; signal: AbortSignal }> = [];
let outcomes: Array<GatewayOutcome | Error> = [];

class FakeThunderBridge {
	constructor(
		readonly url: string,
		readonly options: { token?: string },
	) {}

	waitForPayment(id: string, options: { signal: AbortSignal }) {
		waitCalls.push({ paymentId: id, signal: options.signal });
		const outcome = outcomes.shift();

		if (outcome === undefined) {
			return new Promise<GatewayOutcome>(() => {});
		}
		if (outcome instanceof Error) {
			return Promise.reject(outcome);
		}

		return Promise.resolve(outcome);
	}
}

mock.module("thunder-bridge", thunderBridgeModuleWith(FakeThunderBridge));

const { syncBridgeTransfersProcess } = await import(
	"@/lib/background/processes/sync-bridge-transfers-process"
);

const flushPendingWork = async () => {
	for (let tick = 0; tick < 50; tick += 1) {
		await Promise.resolve();
	}
};

const setupProcess = (params?: { expiresAtSec?: number }) => {
	const watchedPayments: EvoluRow[] = [
		{
			id: paymentId,
			accountId,
			lnInvoice: invoice.lnInvoice,
			paymentHash: invoice.paymentHash,
			gatewayPaymentId,
			expirationIn: params?.expiresAtSec ?? invoice.expiresAtSec,
			gatewayUrl: "https://gateway.invalid",
			gatewayToken: "invented-gateway-token",
		},
	];

	const evoluFake = setupEvolu({
		rowsFor: (query) => {
			if (query.includes("gatewayPaymentId")) {
				return watchedPayments;
			}
			if (query.includes("expectedProductAmount")) {
				return [{ tipAmount: null, expectedProductAmount: amountSats }];
			}
			if (query.includes("paymentLnBridge")) {
				return [{ id: paymentId }];
			}
			return [];
		},
	});

	const reports: NotificationUI[] = [];

	const run = () =>
		syncBridgeTransfersProcess.run({
			evolu: evoluFake.evolu,
			addNotification: (notification: NotificationUI) => {
				reports.push(notification);

				return {
					update: (updated: NotificationUI) => {
						reports.push(updated);
					},
					delete: () => {},
				};
			},
		} as unknown as Parameters<BackgroundProcess["run"]>[0]);

	return { ...evoluFake, reports, run, watchedPayments };
};

beforeEach(() => {
	waitCalls = [];
	outcomes = [];
});

describe("syncBridgeTransfersProcess", () => {
	it("writes the transaction, its lud16 detail and the watching state when the preimage proves the payment", async () => {
		outcomes = [{ status: "paid", preimage: invoice.preimage }];
		const { run, upserts, updates } = setupProcess();

		const stop = await run();
		await flushPendingWork();
		stop();

		expect(waitCalls.map((call) => call.paymentId)).toEqual([gatewayPaymentId]);
		expect(writesTo(upserts, "transaction")[0]?.values).toMatchObject({
			id: transactionId,
			accountId,
			_tag: "accountLud16",
			amount: amountSats,
			currency: "BTC",
		});
		expect(writesTo(upserts, "transactionLud16")[0]?.values).toMatchObject({
			id: transactionId,
			lnInvoice: invoice.lnInvoice,
			paymentHash: invoice.paymentHash,
		});
		expect(updates).toEqual([
			{
				table: "paymentWatchingState",
				values: {
					id: paymentId,
					verifiedAt: expect.any(Number),
					proveType: "lnBridge",
					transactionId,
				},
			},
		]);
	});

	it("claims the payment the hash belongs to", async () => {
		outcomes = [{ status: "paid", preimage: invoice.preimage }];
		const { run, upserts } = setupProcess();

		const stop = await run();
		await flushPendingWork();
		stop();

		expect(writesTo(upserts, "reconciliationClaim")[0]?.values).toMatchObject({
			sourceType: "transaction",
			sourceId: transactionId,
			entityType: "payment",
			entityId: paymentId,
			rule: "lnPaymentHash",
			createdBy: "syncBridgeTransfersProcess",
		});
		expect(
			writesTo(upserts, "reconciliationClaimAllocation").map(
				(write) => write.values.componentType,
			),
		).toEqual(["product", "tip", "overpayment"]);
	});

	it("stops with an error and writes nothing when the preimage does not hash to the payment", async () => {
		outcomes = [{ status: "paid", preimage: otherPreimageThan(preimageSeed) }];
		const { run, upserts, updates, reports } = setupProcess();

		const stop = await run();
		await flushPendingWork();
		stop();

		expect(writesTo(upserts, "transaction")).toHaveLength(0);
		expect(updates).toEqual([
			{
				table: "paymentWatchingState",
				values: {
					id: paymentId,
					stoppedAt: expect.any(Number),
					stopReason: PaymentWatchingStopReason.Error,
				},
			},
		]);
		expect(reports.at(-1)?.type).toBe("error");
	});

	it("stops with an error when the gateway reports a paid payment without a preimage", async () => {
		outcomes = [{ status: "paid", preimage: null }];
		const { run, upserts, updates } = setupProcess();

		const stop = await run();
		await flushPendingWork();
		stop();

		expect(writesTo(upserts, "transaction")).toHaveLength(0);
		expect(updates[0]?.values.stopReason).toBe(PaymentWatchingStopReason.Error);
	});

	it("times out an invoice that expired before the gateway was asked", async () => {
		const { run, updates } = setupProcess({
			expiresAtSec: Math.floor(Date.now() / 1000) - 1,
		});

		const stop = await run();
		await flushPendingWork();
		stop();

		expect(waitCalls).toHaveLength(0);
		expect(updates).toEqual([
			{
				table: "paymentWatchingState",
				values: {
					id: paymentId,
					stoppedAt: expect.any(Number),
					stopReason: PaymentWatchingStopReason.Timeout,
				},
			},
		]);
	});

	it("times out when the gateway reports the payment expired", async () => {
		outcomes = [{ status: "expired", preimage: null }];
		const { run, updates } = setupProcess();

		const stop = await run();
		await flushPendingWork();
		stop();

		expect(updates[0]?.values.stopReason).toBe(
			PaymentWatchingStopReason.Timeout,
		);
	});

	it("keeps watching and asks the gateway again after an unreachable gateway", async () => {
		jest.useFakeTimers();
		outcomes = [
			new Error("connection refused"),
			{ status: "paid", preimage: invoice.preimage },
		];
		const { run, updates, upserts, reports } = setupProcess();

		const stop = await run();
		await flushPendingWork();

		expect(waitCalls).toHaveLength(1);
		expect(updates).toHaveLength(0);
		expect(reports.at(-1)).toMatchObject({
			type: "error",
			description: "Gateway unreachable: connection refused",
		});

		jest.advanceTimersByTime(retryDelayMs);
		await flushPendingWork();
		stop();
		jest.useRealTimers();

		expect(waitCalls).toHaveLength(2);
		expect(writesTo(upserts, "transaction")).toHaveLength(1);
	});

	it("follows a watched payment only once", async () => {
		const { run, notifyQueryListeners } = setupProcess();

		const stop = await run();
		await flushPendingWork();
		notifyQueryListeners();
		await flushPendingWork();
		stop();

		expect(waitCalls).toHaveLength(1);
	});

	it("aborts the wait when the payment leaves the watched set", async () => {
		const { run, notifyQueryListeners, watchedPayments } = setupProcess();

		const stop = await run();
		await flushPendingWork();
		watchedPayments.length = 0;
		notifyQueryListeners();
		await flushPendingWork();
		stop();

		expect(waitCalls[0]?.signal.aborted).toBe(true);
	});

	it("aborts every wait when the process is stopped", async () => {
		const { run } = setupProcess();

		const stop = await run();
		await flushPendingWork();
		stop();

		expect(waitCalls[0]?.signal.aborted).toBe(true);
	});
});
