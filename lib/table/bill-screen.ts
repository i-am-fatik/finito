import type { ScreenData } from "@/lib/bill/driver";
import type { Id } from "@/lib/evolu/types";
import {
	type Currency,
	type Integer,
	NonEmptyString,
	type NonEmptyString255,
	NonNegativeInteger,
} from "@/lib/shared/types";

export type TableBill = {
	currency: Currency;
	table: { label: NonEmptyString255 } | null;
	items: ReadonlyArray<{
		quantity: number;
		item: { id: Id; label: NonEmptyString255; price: Integer };
	}>;
};

export type TableBillView = {
	paying?: ReadonlyMap<Id, number>;
	settled?: ReadonlyMap<Id, number>;
	venueName?: NonEmptyString255 | null;
};

export const billScreenOf = (
	bill: TableBill | undefined,
	view: TableBillView = {},
): Extract<ScreenData, { variant: "table" }>["payload"] => {
	if (bill === undefined) {
		return {
			bill: null,
		};
	}

	const itemLines = bill.items
		.map((line) => {
			const quantity = line.quantity - (view.settled?.get(line.item.id) ?? 0);
			return {
				quantity,
				paying: view.paying?.get(line.item.id) ?? 0,
				optionality: {
					checked: NonNegativeInteger(Math.max(quantity, 0)),
				},
				item: line.item,
			};
		})
		.filter((line) => line.quantity > 0);

	return {
		bill: {
			currency: bill.currency,
			itemLines,
		},
		...(bill.table === null ? {} : { table: { name: bill.table.label } }),
		merchant: {
			name: view.venueName ?? bill.table?.label ?? NonEmptyString("Unknown"),
		},
	};
};
