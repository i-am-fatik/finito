import { describe, expect, it } from "bun:test";
import { createIdFromString } from "@evolu/common";
import {
	Integer,
	NonEmptyString,
	PositiveNumber,
	Uuid7,
} from "@/lib/shared/types";
import {
	type PaidLine,
	type PendingTablePayment,
	pendingTablePayments,
} from "@/lib/table/pending-table-payments";

const billId = createIdFromString("bill");
const otherBillId = createIdFromString("otherBill");
const beerId = createIdFromString("beer");
const soupId = createIdFromString("soup");
const now = 1_800_000_000_000;

const line = (itemId: PaidLine["itemId"], quantity: number): PaidLine => ({
	itemId,
	catalogItemId: null,
	quantity: PositiveNumber(quantity),
	totalAmount: Integer(quantity * 4500),
});

const payment = (
	overrides?: Partial<PendingTablePayment>,
): PendingTablePayment => ({
	subscriptionId: Uuid7("019a0000-0000-7000-8000-000000000001"),
	pubkey: "invented-pubkey",
	qrCodeId: NonEmptyString("table-4"),
	billId,
	lines: [line(beerId, 2)],
	expiresAt: now + 60_000,
	...overrides,
});

describe("pendingTablePayments", () => {
	it("adds up what other guests are still paying on the same bill", () => {
		const pending = pendingTablePayments();
		pending.add(createIdFromString("p1"), payment());
		pending.add(
			createIdFromString("p2"),
			payment({ lines: [line(beerId, 1), line(soupId, 1)] }),
		);
		pending.add(createIdFromString("p3"), payment({ billId: otherBillId }));

		expect(pending.quantitiesFor(billId, now)).toEqual(
			new Map([
				[beerId, 3],
				[soupId, 1],
			]),
		);
	});

	it("forgets a payment whose invoice expired", () => {
		const pending = pendingTablePayments();
		pending.add(createIdFromString("p1"), payment({ expiresAt: now }));

		expect(pending.quantitiesFor(billId, now)).toEqual(new Map());
		expect(pending.settle(createIdFromString("p1"))).toBeUndefined();
	});

	it("hands a settled payment back once and frees its quantities", () => {
		const pending = pendingTablePayments();
		const id = createIdFromString("p1");
		pending.add(id, payment());

		expect(pending.settle(id)).toEqual(payment());
		expect(pending.settle(id)).toBeUndefined();
		expect(pending.quantitiesFor(billId, now)).toEqual(new Map());
	});
});
