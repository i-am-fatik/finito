import { describe, expect, it } from "bun:test";
import { createIdFromString } from "@evolu/common";
import { createUpsertLnPaymentHashReconciliationClaims } from "@/lib/reconciliation/service";
import { Integer, NonEmptyString } from "@/lib/shared/types";
import {
	type EvoluRow,
	setupEvolu,
	sqlOf,
	writesTo,
} from "@/lib/test-support/evolu";

const transactionId = createIdFromString("incomingTransaction");
const accountId = createIdFromString("lud16Account");
const paymentId = createIdFromString("watchedPayment");
const otherPaymentId = createIdFromString("otherWatchedPayment");
const paymentHash = NonEmptyString("a".repeat(64));

const claimIdFor = (claimedPaymentId: string) =>
	createIdFromString(
		`reconciliationClaim:lnPaymentHash:${transactionId}:${accountId}:${claimedPaymentId}`,
	);

const allocationsByComponent = (upserts: ReadonlyArray<{ values: EvoluRow }>) =>
	Object.fromEntries(
		upserts.map((write) => [write.values.componentType, write.values.amount]),
	);

const setupClaims = (params: {
	payments: ReadonlyArray<{
		id: string;
		expectedProductAmount?: number | null;
		expectedTipAmount?: number | null;
	}>;
}) => {
	const allocationRowFor = (query: string): ReadonlyArray<EvoluRow> => {
		const claimed = params.payments.find((payment) =>
			query.includes(payment.id),
		);

		return claimed === undefined || claimed.expectedProductAmount === undefined
			? []
			: [
					{
						tipAmount: claimed.expectedTipAmount ?? null,
						expectedProductAmount: claimed.expectedProductAmount,
					},
				];
	};

	const evoluFake = setupEvolu({
		rowsFor: (query) =>
			query.includes("expectedProductAmount")
				? allocationRowFor(query)
				: params.payments.map((payment) => ({ id: payment.id })),
	});

	const upsertClaims = createUpsertLnPaymentHashReconciliationClaims({
		evolu: evoluFake.evolu,
	});

	return {
		...evoluFake,
		claim: (
			amount: number,
			source:
				| "paymentLnBridge"
				| "paymentLnSpark"
				| "paymentLnZap"
				| "paymentLnNwc" = "paymentLnBridge",
		) =>
			upsertClaims({
				transactionId,
				accountId,
				paymentHash,
				amount: Integer(amount),
				source,
				createdBy: "syncBridgeTransfersProcess",
			}),
	};
};

const setupOnePayment = (params: {
	expectedProductAmount: number;
	expectedTipAmount?: number | null;
}) =>
	setupClaims({
		payments: [
			{
				id: paymentId,
				expectedProductAmount: params.expectedProductAmount,
				expectedTipAmount: params.expectedTipAmount ?? null,
			},
		],
	});

describe("createUpsertLnPaymentHashReconciliationClaims", () => {
	it("splits an exact payment into the product and the tip it was asked for", async () => {
		const { claim, upserts } = setupOnePayment({
			expectedProductAmount: 1000,
			expectedTipAmount: 150,
		});

		await claim(1150);

		expect(
			allocationsByComponent(
				writesTo(upserts, "reconciliationClaimAllocation"),
			),
		).toEqual({ product: 1000, tip: 150, overpayment: 0 });
	});

	it("gives an underpayment entirely to the product and nothing to the tip", async () => {
		const { claim, upserts } = setupOnePayment({
			expectedProductAmount: 1000,
			expectedTipAmount: 150,
		});

		await claim(400);

		expect(
			allocationsByComponent(
				writesTo(upserts, "reconciliationClaimAllocation"),
			),
		).toEqual({ product: 400, tip: 0, overpayment: 0 });
	});

	it("fills the product before it gives anything to the tip", async () => {
		const { claim, upserts } = setupOnePayment({
			expectedProductAmount: 1000,
			expectedTipAmount: 150,
		});

		await claim(1050);

		expect(
			allocationsByComponent(
				writesTo(upserts, "reconciliationClaimAllocation"),
			),
		).toEqual({ product: 1000, tip: 50, overpayment: 0 });
	});

	it("books everything above the product and the tip as an overpayment", async () => {
		const { claim, upserts } = setupOnePayment({
			expectedProductAmount: 1000,
			expectedTipAmount: 150,
		});

		await claim(2000);

		expect(
			allocationsByComponent(
				writesTo(upserts, "reconciliationClaimAllocation"),
			),
		).toEqual({ product: 1000, tip: 150, overpayment: 850 });
	});

	it("allocates nothing for a zero amount", async () => {
		const { claim, upserts } = setupOnePayment({
			expectedProductAmount: 1000,
			expectedTipAmount: 150,
		});

		await claim(0);

		expect(
			allocationsByComponent(
				writesTo(upserts, "reconciliationClaimAllocation"),
			),
		).toEqual({ product: 0, tip: 0, overpayment: 0 });
	});

	it("never allocates a negative amount", async () => {
		const { claim, upserts } = setupOnePayment({
			expectedProductAmount: 1000,
			expectedTipAmount: 150,
		});

		await claim(-500);

		expect(
			allocationsByComponent(
				writesTo(upserts, "reconciliationClaimAllocation"),
			),
		).toEqual({ product: 0, tip: 0, overpayment: 0 });
	});

	it("treats a payment without a tip as expecting no tip", async () => {
		const { claim, upserts } = setupOnePayment({
			expectedProductAmount: 1000,
			expectedTipAmount: null,
		});

		await claim(1200);

		expect(
			allocationsByComponent(
				writesTo(upserts, "reconciliationClaimAllocation"),
			),
		).toEqual({ product: 1000, tip: 0, overpayment: 200 });
	});

	it("books the whole amount as an overpayment when the payment expects nothing", async () => {
		const { claim, upserts } = setupOnePayment({
			expectedProductAmount: 0,
			expectedTipAmount: null,
		});

		await claim(600);

		expect(
			allocationsByComponent(
				writesTo(upserts, "reconciliationClaimAllocation"),
			),
		).toEqual({ product: 0, tip: 0, overpayment: 600 });
	});

	it("writes the claim against the payment the hash resolved to", async () => {
		const { claim, upserts } = setupOnePayment({ expectedProductAmount: 1000 });

		await claim(1000);

		expect(writesTo(upserts, "reconciliationClaim")).toEqual([
			{
				table: "reconciliationClaim",
				values: {
					id: claimIdFor(paymentId),
					sourceType: "transaction",
					sourceId: transactionId,
					entityType: "payment",
					entityId: paymentId,
					confidence: 1,
					rule: "lnPaymentHash",
					createdBy: "syncBridgeTransfersProcess",
				},
			},
		]);
	});

	it("derives every id from the transaction, the account and the payment, so a repeat claim overwrites instead of duplicating", async () => {
		const first = setupOnePayment({ expectedProductAmount: 1000 });
		await first.claim(1000);
		const second = setupOnePayment({ expectedProductAmount: 1000 });
		await second.claim(1000);

		expect(second.upserts).toEqual(first.upserts);
		expect(
			writesTo(first.upserts, "reconciliationClaimAllocation").map(
				(write) => write.values.id,
			),
		).toEqual([
			createIdFromString(
				`reconciliationClaimAllocation:${claimIdFor(paymentId)}:product`,
			),
			createIdFromString(
				`reconciliationClaimAllocation:${claimIdFor(paymentId)}:tip`,
			),
			createIdFromString(
				`reconciliationClaimAllocation:${claimIdFor(paymentId)}:overpayment`,
			),
		]);
	});

	it("claims every payment that shares the hash, each against its own expectation", async () => {
		const { claim, upserts } = setupClaims({
			payments: [
				{ id: paymentId, expectedProductAmount: 1000, expectedTipAmount: 150 },
				{ id: otherPaymentId, expectedProductAmount: 400 },
			],
		});

		await claim(1150);

		expect(
			writesTo(upserts, "reconciliationClaim").map(
				(write) => write.values.entityId,
			),
		).toEqual([paymentId, otherPaymentId]);
		expect(
			writesTo(upserts, "reconciliationClaimAllocation")
				.filter((write) => write.values.componentType === "product")
				.map((write) => write.values.amount),
		).toEqual([1000, 400]);
	});

	it("skips a payment whose expected allocation cannot be read", async () => {
		const { claim, upserts } = setupClaims({
			payments: [
				{ id: paymentId },
				{ id: otherPaymentId, expectedProductAmount: 400 },
			],
		});

		await claim(400);

		expect(
			writesTo(upserts, "reconciliationClaim").map(
				(write) => write.values.entityId,
			),
		).toEqual([otherPaymentId]);
	});

	it("writes nothing when the hash matches no payment", async () => {
		const { claim, upserts } = setupClaims({ payments: [] });

		await claim(1000);

		expect(upserts).toHaveLength(0);
	});

	it.each([
		["paymentLnBridge", "syncBridgeTransfersProcess"],
		["paymentLnSpark", "syncSparkTransfersProcess"],
		["paymentLnZap", "syncLnZapTransfersProcess"],
		["paymentLnNwc", "syncNwcTransfersProcess"],
	] as const)("looks the hash up in %s", async (source) => {
		const { claim, loadedQueries } = setupClaims({ payments: [] });

		await claim(1000, source);

		expect(sqlOf(loadedQueries[0])).toContain(`inner join "${source}"`);
	});
});
