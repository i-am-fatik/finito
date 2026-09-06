import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import { atom } from "jotai";
import type { PosBill as PosBillRow } from "@/hooks/use-pos";
import { Currency } from "@/lib/shared/types";

const billId = "bill-1";
const tableId = "zY7kQm2WbN4pR8sT1vX3cE";
const otherBillId = "aBcDeFgHiJkLmNoPqRsTuV";

let bills: Record<string, PosBillRow> = {};
let tables: Array<{ id: string; label: string }> = [];

mock.module("next/navigation", () => ({
	useRouter: () => ({ replace: () => {}, push: () => {}, refresh: () => {} }),
	useSearchParams: () => new URLSearchParams(`id=${billId}`),
	usePathname: () => "/admin/pos",
}));

mock.module("@/hooks/use-pos", () => ({
	usePos: () => ({ bills }),
}));

mock.module("@/hooks/use-evolu-query", () => ({
	useEvoluQuery: () => ({ data: tables }),
}));

mock.module("@/hooks/use-evolu", () => ({
	useEvolu: () => ({}),
}));

mock.module("@/hooks/use-nostr", () => ({
	useNostr: () => ({ ndk: null }),
}));

mock.module("@/hooks/use-async-route-push", () => ({
	useAsyncRoutePush: () => () => Promise.resolve(),
}));

mock.module("@/hooks/use-bill", () => ({
	useBill: () => ({
		deleteBill: () => null,
		restoreBill: () => {},
		moveItemsToBill: () => undefined,
		setBillCurrency: () => {},
		setBillRate: () => {},
		setBillLabel: () => {},
		setBillTable: () => {},
		addExistingItem: () => {},
	}),
}));

mock.module("@/atoms/account", () => ({
	accountAtom: atom({ device: { id: "device-1" } }),
}));

const { PosBill } = await import("@/components/pos/pos-bill");

const testBill = (params: {
	id: string;
	displayId: number;
	itemLabel?: string;
	tableLabel?: string;
}) =>
	({
		id: params.id,
		deviceId: null,
		displayId: params.displayId,
		label: null,
		currency: Currency.CZK,
		tableId: null,
		table: params.tableLabel
			? { id: `${params.id}-table`, label: params.tableLabel }
			: null,
		items:
			params.itemLabel === undefined
				? []
				: [
						{
							id: `${params.id}-line`,
							itemId: `${params.id}-item`,
							quantity: 2,
							item: {
								label: params.itemLabel,
								price: 5000,
								currency: Currency.CZK,
							},
						},
					],
		rates: [],
	}) as unknown as PosBillRow;

const clickButton = (name: string) => {
	fireEvent.click(screen.getByRole("button", { name }));
};

const selectOneItem = (itemLabel: string) => {
	const row = screen.getByText(itemLabel).parentElement?.parentElement;
	if (row === null || row === undefined) {
		throw new Error(`No row around ${itemLabel}`);
	}
	const buttons = within(row).getAllByRole("button");
	fireEvent.click(buttons[buttons.length - 1]);
};

const openSplitTarget = (target: string) => {
	clickButton("pos:bill.split.start");
	selectOneItem("Pivo");
	clickButton(target);
};

const dialogTriggerText = () =>
	within(screen.getByRole("dialog")).getByRole("combobox").textContent;

beforeEach(() => {
	bills = {};
	tables = [];
});

afterEach(cleanup);

describe("PosBill move dialogs", () => {
	it("names the target table by its label, not by its id", () => {
		const bill = testBill({ id: billId, displayId: 7, itemLabel: "Pivo" });
		bills = { [billId]: bill };
		tables = [{ id: tableId, label: "Terasa 3" }];

		render(<PosBill billId={billId as never} bill={bill} />);
		openSplitTarget("pos:bill.split.moveToAnotherTable");

		expect(dialogTriggerText()).toContain("Terasa 3");
		expect(dialogTriggerText()).not.toContain(tableId);
	});

	it("names the target bill by its label, not by its id", () => {
		const bill = testBill({ id: billId, displayId: 7, itemLabel: "Pivo" });
		const other = testBill({
			id: otherBillId,
			displayId: 8,
			tableLabel: "Bar 1",
		});
		bills = { [billId]: bill, [otherBillId]: other };

		render(<PosBill billId={billId as never} bill={bill} />);
		openSplitTarget("pos:bill.split.moveToExistingBill");

		expect(dialogTriggerText()).toContain("Bar 1");
		expect(dialogTriggerText()).not.toContain(otherBillId);
	});
});
