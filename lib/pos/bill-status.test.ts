import { describe, expect, it } from "bun:test";
import { PaymentStatus } from "@/lib/evolu/model/payment-status";
import { PaymentWatchingStopReason } from "@/lib/evolu/model/payment-watching-state";
import {
	BillStatus,
	ChargeState,
	resolveBillStatus,
	resolveChargeState,
} from "@/lib/pos/bill-status";

const now = 1_700_000_000_000;
const awaiting = {
	paymentStatus: PaymentStatus.Unpaid,
	expiresAt: now + 60_000,
	watching: { verifiedAt: null, stoppedAt: null, stopReason: null },
	now,
};

describe("resolveBillStatus", () => {
	it("calls a bill without a payment open", () => {
		expect(resolveBillStatus({ closedAt: null, paymentId: null })).toBe(
			BillStatus.Open,
		);
	});

	it("calls a bill with a payment and no closing time charging", () => {
		expect(resolveBillStatus({ closedAt: null, paymentId: "p1" })).toBe(
			BillStatus.Charging,
		);
	});

	it("calls a bill with a closing time closed whatever its payment", () => {
		expect(resolveBillStatus({ closedAt: now, paymentId: null })).toBe(
			BillStatus.Closed,
		);
		expect(resolveBillStatus({ closedAt: now, paymentId: "p1" })).toBe(
			BillStatus.Closed,
		);
	});
});

describe("resolveChargeState", () => {
	it("waits while nothing has been claimed and the code is still valid", () => {
		expect(resolveChargeState(awaiting)).toBe(ChargeState.Awaiting);
	});

	it("is paid once the claims cover the amount, even after the code expired", () => {
		expect(
			resolveChargeState({
				...awaiting,
				paymentStatus: PaymentStatus.Paid,
				expiresAt: now - 1,
			}),
		).toBe(ChargeState.Paid);
		expect(
			resolveChargeState({
				...awaiting,
				paymentStatus: PaymentStatus.Overpaid,
			}),
		).toBe(ChargeState.Paid);
	});

	it("keeps waiting on an underpaid claim", () => {
		expect(
			resolveChargeState({
				...awaiting,
				paymentStatus: PaymentStatus.Underpaid,
			}),
		).toBe(ChargeState.Awaiting);
	});

	it("expires when the code's time is up", () => {
		expect(resolveChargeState({ ...awaiting, expiresAt: now })).toBe(
			ChargeState.Expired,
		);
	});

	it("waits forever for a payment whose methods carry no expiry", () => {
		expect(resolveChargeState({ ...awaiting, expiresAt: null })).toBe(
			ChargeState.Awaiting,
		);
	});

	it("reads a timed out watch as expired and any other stop as stopped", () => {
		expect(
			resolveChargeState({
				...awaiting,
				watching: {
					verifiedAt: null,
					stoppedAt: now - 5,
					stopReason: PaymentWatchingStopReason.Timeout,
				},
			}),
		).toBe(ChargeState.Expired);
		expect(
			resolveChargeState({
				...awaiting,
				watching: {
					verifiedAt: null,
					stoppedAt: now - 5,
					stopReason: PaymentWatchingStopReason.Error,
				},
			}),
		).toBe(ChargeState.Stopped);
	});

	it("waits when the payment has no watcher at all, as a cash only payment does", () => {
		expect(resolveChargeState({ ...awaiting, watching: null })).toBe(
			ChargeState.Awaiting,
		);
	});
});
