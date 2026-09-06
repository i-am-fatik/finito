import { beforeEach, describe, expect, it } from "bun:test";
import {
	type BillChargerDeps,
	createBillCharger,
	createPaymentItemFromBillLine,
} from "@/lib/pos/charge";
import { Currency, Integer, NonEmptyString255 } from "@/lib/shared/types";

let minted: Array<Record<string, unknown>> = [];
let conversions: Array<[number, string]> = [];
let linked: Array<Record<string, unknown>> = [];
let dropped: Array<Record<string, unknown>> = [];
let events: string[] = [];
let rate: number | null = 2100;
let refusal: Error | null = null;

const deps: BillChargerDeps = {
	deviceId: "device-1" as never,
	createPayment: async (params) => {
		minted.push(params);
		events.push("mint");
		if (refusal !== null) {
			throw refusal;
		}
		return "pay-1" as never;
	},
	convertToBtc: async (amount, currency) => {
		conversions.push([amount, currency]);
		return rate === null ? null : Integer(rate);
	},
	linkPayment: (params) => {
		linked.push(params);
		events.push("link");
	},
	dropPayment: (params) => {
		dropped.push(params);
		events.push("drop");
	},
};

const beer = {
	label: NonEmptyString255("Pivo"),
	price: Integer(333),
	currency: Currency.CZK,
	catalogItemId: null,
	unitOfMeasure: null,
	internalCode: null,
	productCodeType: null,
	productCodeValue: null,
	categoryId: null,
};
const line = {
	id: "line-1",
	posBillId: "bill-1",
	_tag: "add",
	quantity: 3,
	item: beer,
};
const params = {
	billId: "bill-1" as never,
	currency: Currency.CZK,
	total: Integer(999),
	items: [createPaymentItemFromBillLine(line as never)],
};

beforeEach(() => {
	minted = [];
	conversions = [];
	linked = [];
	dropped = [];
	events = [];
	rate = 2100;
	refusal = null;
});

describe("createPaymentItemFromBillLine", () => {
	it("keeps the item, the quantity and a rounded total and nothing of the bill line", () => {
		expect(createPaymentItemFromBillLine(line as never)).toEqual({
			item: beer,
			quantity: 3,
			totalAmount: Integer(999),
			optionalityChecked: null,
		});
	});

	it("prices a partial quantity when one is given", () => {
		expect(createPaymentItemFromBillLine(line as never, 1)).toMatchObject({
			quantity: 1,
			totalAmount: 333,
		});
	});
});

describe("createBillCharger", () => {
	it("converts a fiat total to satoshis, mints for this device without a tip and links the bill", async () => {
		const paymentId = await createBillCharger(deps).charge(params);

		expect(paymentId).toBe("pay-1" as never);
		expect(conversions).toEqual([[999, Currency.CZK]]);
		expect(minted[0]).toMatchObject({
			payment: { deviceId: "device-1", currency: Currency.CZK },
			tipAmount: null,
			amountInBtc: 2100,
			items: [{ quantity: 3, totalAmount: 999 }],
		});
		expect(linked).toEqual([{ billId: "bill-1", paymentId: "pay-1" }]);
	});

	it("takes a bitcoin total as the satoshi amount without asking for a rate", async () => {
		await createBillCharger(deps).charge({
			...params,
			currency: Currency.BTC,
			total: Integer(2100),
		});

		expect(conversions).toEqual([]);
		expect(minted[0]).toMatchObject({ amountInBtc: 2100 });
	});

	it("leaves the satoshi amount out when no rate is available", async () => {
		rate = null;

		await createBillCharger(deps).charge(params);

		expect(minted[0]).toHaveProperty("amountInBtc", undefined);
	});

	it("links nothing and lets the refusal through when the payment cannot be minted", async () => {
		refusal = new Error("gateway down");

		await expect(createBillCharger(deps).charge(params)).rejects.toThrow(
			"gateway down",
		);
		expect(linked).toEqual([]);
	});

	it("keeps the bill on the old payment until the replacement exists, then swaps", async () => {
		await createBillCharger(deps).recharge({
			...params,
			paymentId: "pay-0" as never,
		});

		expect(events).toEqual(["mint", "drop", "link"]);
		expect(dropped).toEqual([{ paymentId: "pay-0" }]);
		expect(linked).toEqual([{ billId: "bill-1", paymentId: "pay-1" }]);
	});

	it("leaves the bill on its old payment when the replacement cannot be minted", async () => {
		refusal = new Error("gateway down");

		await expect(
			createBillCharger(deps).recharge({
				...params,
				paymentId: "pay-0" as never,
			}),
		).rejects.toThrow("gateway down");
		expect(dropped).toEqual([]);
		expect(linked).toEqual([]);
	});
});
