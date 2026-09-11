import { describe, expect, it } from "bun:test";
import { createIdFromString } from "@evolu/common";
import {
	Currency,
	Integer,
	NonEmptyString,
	NonEmptyString255,
	NonNegativeInteger,
} from "@/lib/shared/types";
import { billScreenOf, type TableBill } from "@/lib/table/bill-screen";

const beerId = createIdFromString("beer");
const wineId = createIdFromString("wine");

const billOf = (overrides?: Partial<TableBill>): TableBill => ({
	currency: Currency.CZK,
	table: { label: NonEmptyString255("Table 4") },
	items: [
		{
			quantity: 3,
			item: {
				id: beerId,
				label: NonEmptyString255("Beer"),
				price: Integer(45),
			},
		},
	],
	...overrides,
});

describe("billScreenOf", () => {
	it("says the bill is gone when the till has none", () => {
		expect(billScreenOf(undefined)).toEqual({ bill: null });
	});

	it("preselects the whole tab", () => {
		const screen = billScreenOf(billOf());

		expect(screen.bill?.itemLines[0]).toMatchObject({
			quantity: 3,
			optionality: { checked: NonNegativeInteger(3) },
		});
	});

	it("names the venue the guest walked into", () => {
		const screen = billScreenOf(billOf(), {
			venueName: NonEmptyString255("Hospoda U Špuntu"),
		});

		expect(screen.merchant?.name).toBe(NonEmptyString("Hospoda U Špuntu"));
		expect(screen.table?.name).toBe("Table 4");
	});

	it("falls back to the table when no venue name is set", () => {
		expect(billScreenOf(billOf()).merchant?.name).toBe(
			NonEmptyString("Table 4"),
		);
	});

	it("calls a bill without a table unknown", () => {
		const screen = billScreenOf(billOf({ table: null }));

		expect(screen.merchant?.name).toBe(NonEmptyString("Unknown"));
		expect(screen.table).toBeUndefined();
	});

	it("shows how much of a line somebody else is paying", () => {
		const screen = billScreenOf(billOf(), {
			paying: new Map([[beerId, 2]]),
		});

		expect(screen.bill?.itemLines[0]).toMatchObject({
			quantity: 3,
			paying: 2,
		});
	});

	it("takes settled pieces off the line", () => {
		const screen = billScreenOf(billOf(), {
			settled: new Map([[beerId, 1]]),
		});

		expect(screen.bill?.itemLines[0]).toMatchObject({
			quantity: 2,
			optionality: { checked: NonNegativeInteger(2) },
		});
	});

	it("drops a line the settlement emptied", () => {
		const bill = billOf({
			items: [
				{
					quantity: 1,
					item: {
						id: beerId,
						label: NonEmptyString255("Beer"),
						price: Integer(45),
					},
				},
				{
					quantity: 2,
					item: {
						id: wineId,
						label: NonEmptyString255("Wine"),
						price: Integer(90),
					},
				},
			],
		});

		const screen = billScreenOf(bill, { settled: new Map([[beerId, 1]]) });

		expect(screen.bill?.itemLines).toHaveLength(1);
		expect(screen.bill?.itemLines[0]?.item.id).toBe(wineId);
	});
});
