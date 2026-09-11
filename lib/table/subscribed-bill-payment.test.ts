import { describe, expect, it } from "bun:test";
import { createIdFromString } from "@evolu/common";
import type { TablePaymentRequest } from "@/lib/contracts/table";
import { PaymentDefaultMethodType } from "@/lib/evolu/model/payment-default-method";
import type { Id } from "@/lib/evolu/types";
import {
	Currency,
	Integer,
	NonEmptyString,
	NonNegativeInteger,
} from "@/lib/shared/types";
import {
	type OpenBill,
	paymentFromSubscribedBill,
	type TablePayment,
	type TablePaymentDeps,
} from "@/lib/table/subscribed-bill-payment";
import { type EvoluRow, setupEvolu } from "@/lib/test-support/evolu";

const billId = createIdFromString("tableBill");
const beerId = createIdFromString("beer");
const soupId = createIdFromString("soup");
const wineId = createIdFromString("wine");
const paymentId = createIdFromString("tablePayment");
const deviceId = createIdFromString("merchantDevice");
const beerCatalogId = createIdFromString("catalog:beer");
const invoiceExpiresAtSec = 1_800_000_000;

const bill: OpenBill = {
	id: billId,
	currency: Currency.CZK,
	table: { label: "Table 4" },
	items: [
		{ quantity: 3, item: { id: beerId, label: "Beer", price: 4500 } },
		{ quantity: 1, item: { id: soupId, label: "Soup", price: 6000 } },
	],
};

const itemRow = (id: Id, label: string, price: number): EvoluRow => ({
	id,
	label,
	price,
	currency: Currency.CZK,
	catalogItemId: createIdFromString(`catalog:${label.toLowerCase()}`),
	unitOfMeasure: null,
	internalCode: null,
	productCodeType: null,
	productCodeValue: null,
	categoryId: null,
});

const invoiceRow: EvoluRow = {
	lnInvoice: "lnbc1invented",
	paymentHash: "invented-hash",
	expirationIn: invoiceExpiresAtSec,
};

const request = (
	overrides?: Partial<TablePaymentRequest>,
): TablePaymentRequest => ({
	paymentId,
	items: [{ id: beerId, price: Integer(4500), label: "Beer", quantity: 2 }],
	tip: NonNegativeInteger(0),
	currency: Currency.CZK,
	paymentOption: { type: "btcLn" },
	...overrides,
});

const refusal = (text: string): TablePayment => ({
	variant: "info",
	payload: { status: "failure", text: NonEmptyString(text) },
});

const setup = (params?: {
	lightningMethod?: boolean;
	invoice?: EvoluRow | null;
	rate?: number | null;
	walletFails?: boolean;
	mintedPayment?: EvoluRow;
	storedLines?: EvoluRow[];
}) => {
	const created: Parameters<TablePaymentDeps["createPayment"]>[0][] = [];
	const conversions: { amount: number; currency: string }[] = [];
	const { evolu } = setupEvolu({
		rowsFor: (query) => {
			if (query.includes("paymentDefaultMethod")) {
				return params?.lightningMethod === false
					? []
					: [{ type: PaymentDefaultMethodType.BtcLn }];
			}
			if (query.includes("productCodeValue")) {
				return [itemRow(beerId, "Beer", 4500), itemRow(soupId, "Soup", 6000)];
			}
			if (query.includes("posBillItemId")) {
				return params?.storedLines ?? [];
			}
			if (query.includes("paymentLnBridge")) {
				return params?.invoice === null ? [] : [params?.invoice ?? invoiceRow];
			}
			if (query.includes("totalAmount")) {
				return params?.mintedPayment === undefined
					? []
					: [params.mintedPayment];
			}
			return [];
		},
	});
	const deps: TablePaymentDeps = {
		evolu,
		deviceId,
		createPayment: async (create) => {
			created.push(create);
			if (params?.walletFails) {
				throw new Error("gateway down");
			}
			return create.payment.id;
		},
		convertToBtc: async (amount, currency) => {
			conversions.push({ amount, currency });
			return params?.rate === null ? null : Integer(params?.rate ?? 300);
		},
	};
	const pay = (input?: {
		bill?: OpenBill | undefined;
		request?: TablePaymentRequest;
	}) =>
		paymentFromSubscribedBill(deps)({
			bill: input !== undefined && "bill" in input ? input.bill : bill,
			request: input?.request ?? request(),
		});

	return { pay, created, conversions };
};

describe("paymentFromSubscribedBill", () => {
	it("refuses when the bill is gone", async () => {
		const { pay, created } = setup();

		expect(await pay({ bill: undefined })).toEqual(
			refusal("The bill is no longer open."),
		);
		expect(created).toHaveLength(0);
	});

	it("refuses a bank transfer", async () => {
		const { pay } = setup();

		expect(
			await pay({
				request: request({ paymentOption: { type: "bankTransferCZ" } }),
			}),
		).toEqual(refusal("This bill can only be paid over Lightning."));
	});

	it("refuses a request in another currency", async () => {
		const { pay } = setup();

		expect(await pay({ request: request({ currency: Currency.USD }) })).toEqual(
			refusal("The bill changed its currency, reload it."),
		);
	});

	it("refuses a tip on a bill that offers none", async () => {
		const { pay } = setup();

		expect(
			await pay({ request: request({ tip: NonNegativeInteger(500) }) }),
		).toEqual(refusal("This bill takes no tip."));
	});

	it("refuses an item that left the bill", async () => {
		const { pay } = setup();

		expect(
			await pay({
				request: request({
					items: [
						{ id: wineId, price: Integer(9000), label: "Wine", quantity: 1 },
					],
				}),
			}),
		).toEqual(refusal("Wine is no longer on the bill."));
	});

	it("refuses a price that changed", async () => {
		const { pay } = setup();

		expect(
			await pay({
				request: request({
					items: [
						{ id: beerId, price: Integer(4000), label: "Beer", quantity: 2 },
					],
				}),
			}),
		).toEqual(refusal("Beer has a new price, reload the bill."));
	});

	it("refuses more than the bill carries", async () => {
		const { pay, created } = setup();

		expect(
			await pay({
				request: request({
					items: [
						{ id: beerId, price: Integer(4500), label: "Beer", quantity: 4 },
					],
				}),
			}),
		).toEqual(refusal("Only 3 of Beer are on the bill."));
		expect(created).toHaveLength(0);
	});

	it("adds up one item requested twice", async () => {
		const { pay } = setup();

		expect(
			await pay({
				request: request({
					items: [
						{ id: beerId, price: Integer(4500), label: "Beer", quantity: 2 },
						{ id: beerId, price: Integer(4500), label: "Beer", quantity: 2 },
					],
				}),
			}),
		).toEqual(refusal("Only 3 of Beer are on the bill."));
	});

	it("mints the whole remaining quantity even while another guest is paying", async () => {
		const { pay, created } = setup();

		const outcome = await pay({
			request: request({
				items: [
					{ id: beerId, price: Integer(4500), label: "Beer", quantity: 3 },
				],
			}),
		});

		expect(outcome.variant).toBe("payment");
		expect(created).toHaveLength(1);
	});

	it("returns the already minted invoice for a replayed payment id and mints nothing", async () => {
		const { pay, created } = setup({
			mintedPayment: { totalAmount: 9000, currency: Currency.CZK },
			storedLines: [
				{
					posBillItemId: beerId,
					catalogItemId: beerCatalogId,
					quantity: 2,
					totalAmount: 9000,
				},
			],
		});

		const replayed = await pay({ bill: undefined });

		expect(created).toHaveLength(0);
		if (replayed.variant !== "payment") {
			throw new Error("expected the stored payment back");
		}
		expect<unknown>(replayed.payload.payment).toEqual({
			id: paymentId,
			direction: "outgoing",
			totalAmount: 9000,
			currency: "CZK",
			paymentSpecification: {
				type: "lnInvoice",
				lnInvoice: "lnbc1invented",
				paymentHash: "invented-hash",
				expirationIn: invoiceExpiresAtSec,
			},
		});
		expect<unknown>(replayed.lines).toEqual([
			{
				itemId: beerId,
				catalogItemId: beerCatalogId,
				quantity: 2,
				totalAmount: 9000,
			},
		]);
		expect(replayed.expiresAt).toBe(invoiceExpiresAtSec * 1000);
	});

	it("refuses an empty selection", async () => {
		const { pay } = setup();

		expect(await pay({ request: request({ items: [] }) })).toEqual(
			refusal("Nothing is selected."),
		);
	});

	it("refuses when the merchant takes no Lightning", async () => {
		const { pay, created } = setup({ lightningMethod: false });

		expect(await pay()).toEqual(
			refusal("The merchant takes no Lightning payments right now."),
		);
		expect(created).toHaveLength(0);
	});

	it("refuses without an exchange rate", async () => {
		const { pay, created } = setup({ rate: null });

		expect(await pay()).toEqual(
			refusal("The exchange rate is unavailable, try again in a moment."),
		);
		expect(created).toHaveLength(0);
	});

	it("creates the payment for the requested lines and answers with the invoice", async () => {
		const { pay, created, conversions } = setup();

		const outcome = await pay();

		expect<unknown>(created).toEqual([
			{
				payment: { id: paymentId, deviceId, currency: "CZK" },
				items: [
					{
						quantity: 2,
						totalAmount: 9000,
						optionalityChecked: null,
						posBill: { billId, itemId: beerId },
						item: {
							label: "Beer",
							price: 4500,
							currency: "CZK",
							catalogItemId: beerCatalogId,
							unitOfMeasure: null,
							internalCode: null,
							productCodeType: null,
							productCodeValue: null,
							categoryId: null,
						},
					},
				],
				tipAmount: 0,
				amountInBtc: 300,
			},
		]);
		expect(conversions).toEqual([{ amount: 9000, currency: "CZK" }]);
		expect<unknown>(outcome).toEqual({
			variant: "payment",
			payload: {
				payment: {
					id: paymentId,
					direction: "outgoing",
					totalAmount: 9000,
					currency: "CZK",
					paymentSpecification: {
						type: "lnInvoice",
						lnInvoice: "lnbc1invented",
						paymentHash: "invented-hash",
						expirationIn: invoiceExpiresAtSec,
					},
				},
				merchant: { name: "Table 4" },
			},
			lines: [
				{
					itemId: beerId,
					catalogItemId: beerCatalogId,
					quantity: 2,
					totalAmount: 9000,
				},
			],
			expiresAt: invoiceExpiresAtSec * 1000,
		});
	});

	it("needs no exchange rate for a bill kept in sats", async () => {
		const { pay, created, conversions } = setup();

		await pay({
			bill: { ...bill, currency: Currency.BTC },
			request: request({ currency: Currency.BTC }),
		});

		expect(conversions).toHaveLength(0);
		expect<unknown>(created[0]?.amountInBtc).toBe(9000);
	});

	it("refuses when the wallet issues no invoice", async () => {
		const { pay } = setup({ walletFails: true });

		expect(await pay()).toEqual(
			refusal("The merchant's wallet did not issue an invoice, try again."),
		);
	});

	it("refuses when the created payment carries no Lightning invoice", async () => {
		const { pay } = setup({ invoice: null });

		expect(await pay()).toEqual(
			refusal("The payment carries no Lightning invoice, ask the staff."),
		);
	});

	it("names no merchant when the bill sits on no table", async () => {
		const { pay } = setup();

		const outcome = await pay({ bill: { ...bill, table: null } });

		expect(outcome.variant).toBe("payment");
		expect(outcome.variant === "payment" && "merchant" in outcome.payload).toBe(
			false,
		);
	});
});
