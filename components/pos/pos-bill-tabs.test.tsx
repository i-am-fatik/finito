import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { PosBill, PosClosedBill } from "@/hooks/use-pos";
import { Currency } from "@/lib/shared/types";

const billId = "bill-1";

let bills: Record<string, PosBill> = {};
let closedBills: PosClosedBill[] = [];
let confirmCalls: Array<Record<string, unknown>> = [];
let confirmAnswer = true;
let deletedBillIds: string[] = [];
let restoredBills: Array<Record<string, unknown>> = [];
let toasts: Array<{
	message: string;
	options: { action: { onClick: () => void } };
}> = [];
let replacedUrls: string[] = [];
let createdBills: Array<Record<string, unknown>> = [];
let searchParams = `id=${billId}`;

mock.module("next/navigation", () => ({
	useRouter: () => ({
		replace: (url: string) => {
			replacedUrls.push(url);
		},
		push: () => {},
		refresh: () => {},
	}),
	useSearchParams: () => new URLSearchParams(searchParams),
	usePathname: () => "/admin/pos",
}));

mock.module("@/hooks/use-pos", () => ({
	usePos: () => ({ bills }),
	usePosClosedBills: () => closedBills,
}));

mock.module("@/hooks/use-bill", () => ({
	useBill: () => ({
		deleteBill: (id: string) => {
			deletedBillIds.push(id);
			return { billId: id, rateIds: [], paymentId: null };
		},
		restoreBill: (deletedBill: Record<string, unknown>) => {
			restoredBills.push(deletedBill);
		},
		createBill: (params: Record<string, unknown>) => {
			createdBills.push(params);
			return { id: "bill-created" };
		},
	}),
}));

mock.module("sonner", () => ({
	toast: (message: string, options: { action: { onClick: () => void } }) => {
		toasts.push({ message, options });
		return 1;
	},
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

const deleteButtons = () =>
	screen.getAllByRole("button", { name: "pos:tabs.deleteBill.confirm" });

const clickDeleteBill = async (index = 0) => {
	deleteButtons()[index].click();
	await Promise.resolve();
	await Promise.resolve();
};

beforeEach(() => {
	bills = {};
	closedBills = [];
	confirmCalls = [];
	confirmAnswer = true;
	deletedBillIds = [];
	restoredBills = [];
	toasts = [];
	replacedUrls = [];
	createdBills = [];
	searchParams = `id=${billId}`;
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

	it("deletes the bill whose cross was clicked, not the one the tabs happen to start with", async () => {
		const secondBillId = "bill-2";
		bills = {
			[billId]: testBill({ itemCount: 0 }),
			[secondBillId]: {
				...testBill({ itemCount: 0 }),
				id: secondBillId,
				displayId: 8,
			} as PosBill,
		};
		render(<PosBillTabs defaultCurrency={Currency.CZK} />);

		await clickDeleteBill(1);

		expect(deletedBillIds).toEqual([secondBillId]);
	});

	it("names a bill by the label the user typed when it sits on no table", () => {
		bills = { [billId]: testBill({ itemCount: 0, label: "Terasa vzadu" }) };

		render(<PosBillTabs defaultCurrency={Currency.CZK} />);

		expect(screen.getByText("Terasa vzadu")).toBeInTheDocument();
	});

	it("lets the table win over a label the user typed", () => {
		bills = {
			[billId]: testBill({
				itemCount: 0,
				label: "Terasa vzadu",
				tableLabel: "Stůl 1",
			}),
		};

		render(<PosBillTabs defaultCurrency={Currency.CZK} />);

		expect(screen.getByText("Stůl 1")).toBeInTheDocument();
		expect(screen.queryByText("Terasa vzadu")).not.toBeInTheDocument();
	});

	it("names the bill being deleted in the question it asks", async () => {
		bills = { [billId]: testBill({ itemCount: 1, tableLabel: "Stůl 1" }) };
		render(<PosBillTabs defaultCurrency={Currency.CZK} />);

		await clickDeleteBill();

		expect(confirmCalls[0]).toMatchObject({
			description: "pos:tabs.deleteBill.description",
		});
	});

	it("opens the first bill when the url names one that is gone", () => {
		searchParams = "id=bill-that-was-deleted";
		bills = { [billId]: testBill({ itemCount: 0 }) };

		render(<PosBillTabs defaultCurrency={Currency.CZK} />);

		expect(replacedUrls).toEqual([`/admin/pos?id=${billId}`]);
	});

	it("drops the id from the url when no bill is left", () => {
		searchParams = "id=bill-that-was-deleted";
		bills = {};

		render(<PosBillTabs defaultCurrency={Currency.CZK} />);

		expect(replacedUrls).toEqual(["/admin/pos?"]);
	});

	it("carries the variant through when it switches bills for the user", () => {
		searchParams = "id=bill-that-was-deleted&variant=split";
		bills = { [billId]: testBill({ itemCount: 0 }) };

		render(<PosBillTabs defaultCurrency={Currency.CZK} />);

		expect(replacedUrls).toEqual([`/admin/pos?id=${billId}&variant=split`]);
	});

	it("opens the bill it just created", () => {
		bills = { [billId]: testBill({ itemCount: 0 }) };
		render(<PosBillTabs defaultCurrency={Currency.CZK} />);

		screen.getByRole("button", { name: /newBill/ }).click();

		expect(createdBills).toEqual([{ defaultCurrency: Currency.CZK }]);
		expect(replacedUrls).toEqual(["/admin/pos?id=bill-created"]);
	});

	it("shows no tab strip at all while there is no bill", () => {
		bills = {};

		render(<PosBillTabs defaultCurrency={Currency.CZK} />);

		expect(screen.queryAllByRole("tab")).toHaveLength(0);
	});

	it("offers to take a deletion back and restores the bill when asked", async () => {
		bills = { [billId]: testBill({ itemCount: 0, tableLabel: "Stůl 1" }) };
		render(<PosBillTabs defaultCurrency={Currency.CZK} />);

		await clickDeleteBill();

		expect(toasts).toHaveLength(1);
		expect(toasts[0].message).toBe("pos:tabs.deleted");
		toasts[0].options.action.onClick();
		expect(restoredBills).toEqual([{ billId, rateIds: [], paymentId: null }]);
	});

	it("lists the paid bills with a way to the bill and to its payment", () => {
		closedBills = [
			{
				id: "closed-1",
				displayId: 3,
				label: null,
				tableLabel: "Stůl 2",
				currency: Currency.CZK,
				totalAmount: 25000,
				paymentId: "pay-9",
				closedAt: Date.now(),
			} as unknown as PosClosedBill,
		];
		render(<PosBillTabs defaultCurrency={Currency.CZK} />);

		fireEvent.click(screen.getByRole("button", { name: "pos:closed.open" }));

		const dialog = screen.getByRole("dialog");
		expect(dialog).toHaveTextContent("Stůl 2");
		expect(dialog).toHaveTextContent("250.00");
		expect(
			screen.getByRole("button", { name: "pos:closed.payment" }),
		).toHaveAttribute("href", "/admin/payments/detail?id=pay-9");
		expect(
			screen.getByRole("button", { name: "pos:closed.bill" }),
		).toHaveAttribute("href", "/admin/payments/bills/detail?id=closed-1");
	});

	it("says so when no bill has been paid yet", () => {
		render(<PosBillTabs defaultCurrency={Currency.CZK} />);

		fireEvent.click(screen.getByRole("button", { name: "pos:closed.open" }));

		expect(screen.getByRole("dialog")).toHaveTextContent("pos:closed.empty");
	});
});
