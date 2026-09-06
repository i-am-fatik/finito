import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { cleanup, renderHook } from "@testing-library/react";

let chargedBills: Array<Record<string, unknown>> = [];
let closedBills: Array<Record<string, unknown>> = [];
let toasts: string[] = [];

mock.module("@/hooks/use-evolu-query", () => ({
	useEvoluQuery: () => ({ data: chargedBills }),
}));

mock.module("@/hooks/use-bill", () => ({
	useBill: () => ({
		closeBill: (params: Record<string, unknown>) => {
			closedBills.push(params);
		},
	}),
}));

mock.module("sonner", () => ({
	toast: Object.assign(() => 1, {
		success: (message: string) => {
			toasts.push(message);
			return 1;
		},
	}),
}));

const { useSettlePaidBills } = await import("@/hooks/use-settle-paid-bills");

const chargedBill = (params: {
	id: string;
	totalAmount: number;
	claimed: number | null;
	tableLabel?: string | null;
	label?: string | null;
}) => ({
	id: params.id,
	displayId: 4,
	label: params.label ?? null,
	tableLabel: params.tableLabel ?? null,
	totalAmount: params.totalAmount,
	reconciliationClaim: { amount: params.claimed },
});

beforeEach(() => {
	chargedBills = [];
	closedBills = [];
	toasts = [];
});

afterEach(cleanup);

describe("useSettlePaidBills", () => {
	it("closes a bill whose claims cover its payment and says which one", () => {
		chargedBills = [
			chargedBill({
				id: "bill-1",
				totalAmount: 10000,
				claimed: 10000,
				tableLabel: "Stůl 1",
			}),
		];

		renderHook(() => useSettlePaidBills());

		expect(closedBills).toEqual([{ billId: "bill-1" }]);
		expect(toasts).toEqual(["pos:bill.paid"]);
	});

	it("leaves an unpaid and an underpaid bill open", () => {
		chargedBills = [
			chargedBill({ id: "bill-1", totalAmount: 10000, claimed: null }),
			chargedBill({ id: "bill-2", totalAmount: 10000, claimed: 9999 }),
		];

		renderHook(() => useSettlePaidBills());

		expect(closedBills).toEqual([]);
		expect(toasts).toEqual([]);
	});

	it("closes an overpaid bill too", () => {
		chargedBills = [
			chargedBill({ id: "bill-1", totalAmount: 10000, claimed: 10500 }),
		];

		renderHook(() => useSettlePaidBills());

		expect(closedBills).toEqual([{ billId: "bill-1" }]);
	});

	it("closes and announces each bill once, however often it renders", () => {
		chargedBills = [
			chargedBill({ id: "bill-1", totalAmount: 10000, claimed: 10000 }),
		];

		const { rerender } = renderHook(() => useSettlePaidBills());
		rerender();
		rerender();

		expect(closedBills).toHaveLength(1);
		expect(toasts).toHaveLength(1);
	});
});
