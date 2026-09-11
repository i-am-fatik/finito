import { z } from "zod";
import { TableIdSchema } from "@/lib/evolu/types";
import { NullableTableIdSchema } from "@/lib/modules/shared/schema";
import {
	Currency,
	IntegerSchema,
	NonEmptyString255Schema,
	PositiveIntegerSchema,
	PositiveNumberSchema,
	TimestampMsSchema,
} from "@/lib/shared/types";

export const posBill = {
	id: TableIdSchema,
	deviceId: TableIdSchema.nullable(),
	displayId: PositiveIntegerSchema,
	label: NonEmptyString255Schema.nullable(),
	currency: z.enum(Currency),
	tableId: NullableTableIdSchema,
	paymentId: NullableTableIdSchema,
	closedAt: TimestampMsSchema.nullable(),
};

export const posBillItemLine = {
	id: TableIdSchema,
	posBillId: TableIdSchema,
	// Device that created this bill item change event.
	deviceId: TableIdSchema.nullable(),
	// Original catalog item reference kept for audit/debugging.
	// Bill projection intentionally merges by `itemId` only.
	catalogItemId: NullableTableIdSchema,
	// Stable snapshot of the item at the time the change was recorded.
	itemId: TableIdSchema,
	// Append-only change type. Existing rows must never be mutated in place.
	_tag: z.enum(["add", "remove"]),
	// Positive amount of this event in bill currency.
	totalAmount: IntegerSchema,
	// Positive quantity of this event. The sign is represented by `_tag`.
	quantity: PositiveNumberSchema,
};

export const posBillRate = {
	id: TableIdSchema,
	billId: TableIdSchema,
	currency: z.enum(Currency),
	// Exchange rate from bill currency to `currency`.
	rate: z.number(),
};
