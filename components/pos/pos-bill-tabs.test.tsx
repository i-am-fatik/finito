import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import type { PosBill } from "@/hooks/use-pos";
import { Currency } from "@/lib/shared/types";

const billId = "bill-1";

let bills: Record<string, PosBill> = {};
let confirmCalls: Array<Record<string, unknown>> = [];
let confirmAnswer = true;
let deletedBillIds: string[] = [];

mock.module("next/navigation", () => ({
	useRouter: () => ({ replace: () => {}, push: () => {}, refresh: () => {} }),
	useSearchParams: () => new URLSearchParams(`id=${billId}`),
	usePathname: () => "/admin/pos",
}));

mock.module("@/hooks/use-pos", () => ({
	usePos: () => ({ bills }),
}));

mock.module("@/hooks/use-bill", () => ({
	useBill: () => ({
		deleteBill: (id: string) => {
			deletedBillIds.push(id);
		},
		createBill: () => ({ id: "bill-created" }),
	}),
}));

mock.module("@/hooks/use-global-dialog", () => ({
	useGlobalDialog: () => ({
		confirm: (params: Record<string, unknown>) => {
			confirmCalls.push(params);
			return Promise.resolve(confirmAnswer);
		},
	}),
}));

const { PosBillTabs } = await import("@/components/pos/pos-bill-tabs");

const testBill = (params: {
	itemCount: number;
	label?: string | null;
	tableLabel?: string | null;
}) =>
	({
		id: billId,
		deviceId: null,
		displayId: 7,
		label: params.label ?? null,
		currency: Currency.CZK,
		tableId: null,
		table: params.tableLabel
			? { id: "table-1", label: params.tableLabel }
			: null,
		items: new Array(params.itemCount).fill({}),
		rates: [],
	}) as unknown as PosBill;

const clickDeleteBill = async () => {
	screen.getByRole("button", { name: "pos:tabs.deleteBill.confirm" }).click();
	await Promise.resolve();
	await Promise.resolve();
};

beforeEach(() => {
	bills = {};
	confirmCalls = [];
	confirmAnswer = true;
	deletedBillIds = [];
});

afterEach(cleanup);

describe("PosBillTabs", () => {
	it("labels a bill without a table or a name by its display id", () => {
		bills = { [billId]: testBill({ itemCount: 0 }) };

		render(<PosBillTabs defaultCurrency={Currency.CZK} />);

		expect(screen.getByText("#7")).toBeInTheDocument();
	});

	it("prefers the table label over the display id", () => {
		bills = { [billId]: testBill({ itemCount: 0, tableLabel: "Stůl 1" }) };

		render(<PosBillTabs defaultCurrency={Currency.CZK} />);

		expect(screen.getByText("Stůl 1")).toBeInTheDocument();
		expect(screen.queryByText("#7")).not.toBeInTheDocument();
	});

	it("deletes an empty bill without asking", async () => {
		bills = { [billId]: testBill({ itemCount: 0 }) };
		render(<PosBillTabs defaultCurrency={Currency.CZK} />);

		await clickDeleteBill();

		expect(confirmCalls).toHaveLength(0);
		expect(deletedBillIds).toEqual([billId]);
	});

	it("asks before deleting a bill that still has items", async () => {
		bills = { [billId]: testBill({ itemCount: 2 }) };
		render(<PosBillTabs defaultCurrency={Currency.CZK} />);

		await clickDeleteBill();

		expect(confirmCalls).toEqual([
			{
				title: "pos:tabs.deleteBill.title",
				description: "pos:tabs.deleteBill.description",
				confirmText: "pos:tabs.deleteBill.confirm",
				cancelText: "pos:tabs.deleteBill.cancel",
				confirmVariant: "destructive",
			},
		]);
		expect(deletedBillIds).toEqual([billId]);
	});

	it("keeps a bill with items when the question is refused", async () => {
		bills = { [billId]: testBill({ itemCount: 2 }) };
		confirmAnswer = false;
		render(<PosBillTabs defaultCurrency={Currency.CZK} />);

		await clickDeleteBill();

		expect(confirmCalls).toHaveLength(1);
		expect(deletedBillIds).toHaveLength(0);
	});
});
