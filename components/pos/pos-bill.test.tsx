import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { reset as resetBaseUiWarnings } from "@base-ui/utils/error";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { atom } from "jotai";
import type { PosBill as PosBillRow } from "@/hooks/use-pos";
import { Currency } from "@/lib/shared/types";

const billId = "bill-1";
const paymentId = "pay-1";
const tableId = "zY7kQm2WbN4pR8sT1vX3cE";
const otherBillId = "aBcDeFgHiJkLmNoPqRsTuV";
const nowSec = Math.floor(Date.now() / 1000);

let bills: Record<string, PosBillRow> = {};
let tables: Array<{ id: string; label: string }> = [];
let payments: Array<Record<string, unknown>> = [];
let navigations: string[] = [];
let chargeCalls: Array<Record<string, unknown>> = [];
let cancelCalls: Array<Record<string, unknown>> = [];
let rechargeCalls: Array<Record<string, unknown>> = [];
let upserts: Array<[string, Record<string, unknown>]> = [];
let confirmAnswer = true;

mock.module("next/navigation", () => ({
	useRouter: () => ({
		replace: (url: string) => {
			navigations.push(url);
		},
		push: (url: string) => {
			navigations.push(url);
		},
		refresh: () => {},
	}),
	useSearchParams: () => new URLSearchParams(`id=${billId}`),
	usePathname: () => "/admin/pos",
}));

mock.module("@/hooks/use-pos", () => ({
	usePos: () => ({ bills }),
}));

mock.module("@/hooks/use-evolu-query", () => ({
	useEvoluQuery: (query: unknown) => {
		const sql = String(query);
		if (sql.includes("tableCode")) {
			return { data: [] };
		}
		if (sql.includes("payment")) {
			return { data: payments };
		}
		return { data: tables };
	},
}));

mock.module("@/hooks/use-evolu", () => ({
	useEvolu: () => ({
		upsert: (table: string, row: Record<string, unknown>) => {
			upserts.push([table, row]);
			return { id: row.id };
		},
	}),
}));

mock.module("@/hooks/use-nostr", () => ({
	useNostr: () => ({ ndk: { signer: { pubkey: "pubkey" } } }),
}));

mock.module("@/hooks/use-bill", () => ({
	useBill: () => ({
		deleteBill: () => null,
		restoreBill: () => {},
		chargeBill: () => {},
		cancelCharge: () => {},
		closeBill: () => {},
		moveItemsToBill: () => undefined,
		setBillCurrency: () => {},
		setBillRate: () => {},
		setBillLabel: () => {},
		setBillTable: () => {},
		addExistingItem: () => {},
	}),
}));

mock.module("@/hooks/use-charge-bill", () => ({
	useChargeBill: () => ({
		charge: async (params: Record<string, unknown>) => {
			chargeCalls.push(params);
			return paymentId;
		},
		cancelCharge: (params: Record<string, unknown>) => {
			cancelCalls.push(params);
		},
		recharge: async (params: Record<string, unknown>) => {
			rechargeCalls.push(params);
			return "pay-2";
		},
	}),
}));

mock.module("@/hooks/use-global-dialog", () => ({
	useGlobalDialog: () => ({
		confirm: () => Promise.resolve(confirmAnswer),
	}),
}));

mock.module("@/atoms/account", () => ({
	accountAtom: atom({ device: { id: "device-1" } }),
}));

mock.module("@/lib/integrations/currency-converter/currency-converter", () => ({
	currencyConverter: { convert: async () => null },
}));

const { PosBill } = await import("@/components/pos/pos-bill");

const beer = {
	label: "Pivo",
	price: 5000,
	currency: Currency.CZK,
	catalogItemId: null,
	unitOfMeasure: null,
	internalCode: null,
	productCodeType: null,
	productCodeValue: null,
	categoryId: null,
};

const testBill = (params: {
	id: string;
	displayId: number;
	itemLabel?: string;
	itemCurrency?: Currency;
	tableLabel?: string;
	paymentId?: string;
}) =>
	({
		id: params.id,
		deviceId: null,
		displayId: params.displayId,
		label: null,
		currency: Currency.CZK,
		tableId: null,
		paymentId: params.paymentId ?? null,
		closedAt: null,
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
								...beer,
								label: params.itemLabel,
								currency: params.itemCurrency ?? beer.currency,
							},
						},
					],
		rates: [],
	}) as unknown as PosBillRow;

const testPayment = (overrides: Record<string, unknown> = {}) => ({
	id: paymentId,
	totalAmount: 10000,
	currency: Currency.CZK,
	lnInvoice: "lnbc1invented",
	expirationIn: nowSec + 600,
	iban: null,
	variableSymbol: null,
	cashAccountId: null,
	webPrivateKey: null,
	watchingId: paymentId,
	verifiedAt: null,
	stoppedAt: null,
	stopReason: null,
	reconciliationClaim: { amount: null },
	...overrides,
});

const clickButton = (name: string | RegExp) => {
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

const renderChargedBill = (paymentOverrides: Record<string, unknown> = {}) => {
	const bill = testBill({
		id: billId,
		displayId: 7,
		itemLabel: "Pivo",
		paymentId,
	});
	bills = { [billId]: bill };
	payments = [testPayment(paymentOverrides)];
	render(<PosBill billId={billId as never} bill={bill} />);
};

beforeEach(() => {
	bills = {};
	tables = [];
	payments = [];
	navigations = [];
	chargeCalls = [];
	cancelCalls = [];
	rechargeCalls = [];
	upserts = [];
	confirmAnswer = true;
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

describe("PosBill rendering", () => {
	it("renders the quantity boxes and the table link without Base UI complaining", () => {
		const bill = testBill({ id: billId, displayId: 7, itemLabel: "Pivo" });
		bills = { [billId]: bill };
		const complaints: string[] = [];
		const originalError = console.error;
		console.error = (...args: unknown[]) => {
			complaints.push(args.map(String).join(" "));
		};

		try {
			resetBaseUiWarnings();
			render(<PosBill billId={billId as never} bill={bill} />);
			clickButton("pos:bill.split.start");
			selectOneItem("Pivo");
		} finally {
			console.error = originalError;
		}

		expect(complaints.filter((line) => line.includes("nativeButton"))).toEqual(
			[],
		);
	});
});

describe("PosBill charging", () => {
	it("hands the whole bill to the charge and stays on the till", async () => {
		const bill = testBill({ id: billId, displayId: 7, itemLabel: "Pivo" });
		bills = { [billId]: bill };
		render(<PosBill billId={billId as never} bill={bill} />);

		clickButton(/pos:bill\.pay/);

		await waitFor(() => expect(chargeCalls).toHaveLength(1));
		expect(chargeCalls[0]).toEqual({
			billId,
			currency: Currency.CZK,
			total: 10000,
			items: [
				{
					item: beer,
					quantity: 2,
					totalAmount: 10000,
					optionalityChecked: null,
				},
			],
		});
		expect(navigations).toEqual([]);
	});

	it("refuses to charge a bill holding an item in a currency it has no rate for", async () => {
		const bill = testBill({
			id: billId,
			displayId: 7,
			itemLabel: "Pivo",
			itemCurrency: Currency.BTC,
		});
		bills = { [billId]: bill };
		render(<PosBill billId={billId as never} bill={bill} />);

		await waitFor(() =>
			expect(
				screen.getAllByText("pos:bill.rate-pending").length,
			).toBeGreaterThan(0),
		);
		clickButton(/pos:bill\.pay/);

		expect(chargeCalls).toEqual([]);
	});

	it("shows the payment in place of the lines while the bill is being charged", () => {
		renderChargedBill();

		expect(
			screen.getByText(/pos:bill\.charge\.state\.awaiting/),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "pos:bill.charge.fullscreen" }),
		).toBeInTheDocument();
		expect(screen.queryByText("Pivo")).not.toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: /pos:bill\.pay/ }),
		).not.toBeInTheDocument();
	});

	it("goes back to the bill by cancelling the charge", () => {
		renderChargedBill();

		clickButton("pos:bill.charge.back");

		expect(cancelCalls).toEqual([{ billId, paymentId }]);
	});

	it("offers a fresh code once the old one expired and recharges the same lines", async () => {
		renderChargedBill({ expirationIn: nowSec - 1 });

		expect(
			screen.queryByRole("button", { name: "pos:bill.charge.fullscreen" }),
		).not.toBeInTheDocument();
		clickButton("pos:bill.charge.retry");

		await waitFor(() => expect(rechargeCalls).toHaveLength(1));
		expect(rechargeCalls[0]).toMatchObject({
			billId,
			paymentId,
			currency: Currency.CZK,
			total: 10000,
			items: [{ quantity: 2, totalAmount: 10000 }],
		});
	});

	it("confirms a settled payment and offers no way back", () => {
		renderChargedBill({ reconciliationClaim: { amount: 10000 } });

		expect(
			screen.getAllByText("pos:bill.charge.state.paid").length,
		).toBeGreaterThan(0);
		expect(
			screen.queryByRole("button", { name: "pos:bill.charge.back" }),
		).not.toBeInTheDocument();
	});

	it("books a cash settlement against the payment once the till confirms", async () => {
		renderChargedBill({ cashAccountId: "cash-1" });

		clickButton("pos:bill.charge.cash");

		await waitFor(() => expect(upserts.length).toBeGreaterThan(0));
		const transaction = upserts.find(([table]) => table === "transaction");
		expect(transaction?.[1]).toMatchObject({
			accountId: "cash-1",
			amount: 10000,
			currency: Currency.CZK,
			_tag: "accountCashRegister",
		});
		const claim = upserts.find(([table]) => table === "reconciliationClaim");
		expect(claim?.[1]).toMatchObject({
			entityId: paymentId,
			createdBy: "posBillCharge",
		});
	});

	it("books nothing when the cash question is refused", async () => {
		confirmAnswer = false;
		renderChargedBill({ cashAccountId: "cash-1" });

		clickButton("pos:bill.charge.cash");
		await Promise.resolve();
		await Promise.resolve();

		expect(upserts).toEqual([]);
	});

	it("hides the cash button when no cash register takes the payment", () => {
		renderChargedBill();

		expect(
			screen.queryByRole("button", { name: "pos:bill.charge.cash" }),
		).not.toBeInTheDocument();
	});

	it("lets the till back out of a payment that no longer exists", () => {
		const bill = testBill({
			id: billId,
			displayId: 7,
			itemLabel: "Pivo",
			paymentId,
		});
		bills = { [billId]: bill };
		payments = [];
		render(<PosBill billId={billId as never} bill={bill} />);

		expect(screen.getByText("pos:bill.charge.missing")).toBeInTheDocument();
		clickButton("pos:bill.charge.back");

		expect(cancelCalls).toEqual([{ billId, paymentId }]);
	});
});
