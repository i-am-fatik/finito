import { describe, expect, it } from "bun:test";
import { createIdFromString } from "@evolu/common";
import { PaymentStatus } from "@/lib/evolu/model/payment-status";
import { PaymentWatchingStopReason } from "@/lib/evolu/model/payment-watching-state";
import {
	resolvePaymentStatus,
	stopPaymentWatching,
} from "@/lib/payment/service";
import { Integer, NonNegativeInteger } from "@/lib/shared/types";
import { type EvoluRow, setupEvolu } from "@/lib/test-support/evolu";

const paymentId = createIdFromString("watchedPayment");

const statusOf = (params: { totalAmount: number; claimed: number | null }) =>
	resolvePaymentStatus({
		payment: {
			totalAmount: NonNegativeInteger(params.totalAmount),
			reconciliationClaim: {
				amount: params.claimed === null ? null : Integer(params.claimed),
			},
		},
	});

const setupWatching = (rows: EvoluRow[]) => {
	const evoluFake = setupEvolu({ rowsFor: () => rows });

	return {
		...evoluFake,
		stop: () =>
			stopPaymentWatching({ evolu: evoluFake.evolu })({
				paymentId,
				reason: PaymentWatchingStopReason.Manual,
			}),
	};
};

describe("resolvePaymentStatus", () => {
	it("is unpaid while nothing has been claimed", () => {
		expect(statusOf({ totalAmount: 1000, claimed: null })).toBe(
			PaymentStatus.Unpaid,
		);
	});

	it("is paid when the claim matches the total", () => {
		expect(statusOf({ totalAmount: 1000, claimed: 1000 })).toBe(
			PaymentStatus.Paid,
		);
	});

	it("is underpaid when the claim falls short", () => {
		expect(statusOf({ totalAmount: 1000, claimed: 999 })).toBe(
			PaymentStatus.Underpaid,
		);
	});

	it("is overpaid when the claim exceeds the total", () => {
		expect(statusOf({ totalAmount: 1000, claimed: 1001 })).toBe(
			PaymentStatus.Overpaid,
		);
	});

	it("reads a claim of zero as nothing claimed rather than as an underpayment", () => {
		expect(statusOf({ totalAmount: 1000, claimed: 0 })).toBe(
			PaymentStatus.Unpaid,
		);
	});

	it("calls a free payment paid only once something is claimed against it", () => {
		expect(statusOf({ totalAmount: 0, claimed: null })).toBe(
			PaymentStatus.Unpaid,
		);
		expect(statusOf({ totalAmount: 0, claimed: 1 })).toBe(
			PaymentStatus.Overpaid,
		);
	});
});

describe("stopPaymentWatching", () => {
	it("stops a payment that is still being watched", async () => {
		const { stop, upserts } = setupWatching([
			{ verifiedAt: null, stoppedAt: null },
		]);

		expect(await stop()).toBe(true);
		expect(upserts).toEqual([
			{
				table: "paymentWatchingState",
				values: {
					id: paymentId,
					stoppedAt: expect.any(Number),
					stopReason: PaymentWatchingStopReason.Manual,
				},
			},
		]);
	});

	it("refuses to stop a payment that is already verified", async () => {
		const { stop, upserts } = setupWatching([
			{ verifiedAt: 1, stoppedAt: null },
		]);

		expect(await stop()).toBe(false);
		expect(upserts).toHaveLength(0);
	});

	it("refuses to stop a payment that is already stopped", async () => {
		const { stop, upserts } = setupWatching([
			{ verifiedAt: null, stoppedAt: 1 },
		]);

		expect(await stop()).toBe(false);
		expect(upserts).toHaveLength(0);
	});

	it("refuses to stop a payment that is not watched at all", async () => {
		const { stop, upserts } = setupWatching([]);

		expect(await stop()).toBe(false);
		expect(upserts).toHaveLength(0);
	});
});
