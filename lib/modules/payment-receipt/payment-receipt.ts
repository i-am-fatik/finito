import { z } from "zod";
import { PaymentReceiptLineKind } from "@/lib/evolu/model/payment-receipt";
import { TableIdSchema } from "@/lib/evolu/types";
import {
	AddressSchema,
	BillingInfoCzSchema,
	BillingInfoSchema,
	ContactSchema,
	NullableTableIdSchema,
} from "@/lib/modules/shared/schema";
import {
	Currency,
	DateStringSchema,
	IntegerSchema,
	NonEmptyString32Schema,
	NonEmptyString255Schema,
	NonEmptyStringSchema,
	NonNegativeIntegerSchema,
	PositiveIntegerSchema,
	TimestampMsSchema,
} from "@/lib/shared/types";

export const paymentReceipt = {
	id: TableIdSchema,
	deviceId: NullableTableIdSchema,
	receiptNumber: NonEmptyString255Schema,
	issuedAt: TimestampMsSchema,
	paymentCreatedAt: NonEmptyString255Schema,
	totalAmount: IntegerSchema,
	currency: z.enum(Currency),
};

export const paymentReceiptSupplier = ContactSchema;

export const paymentReceiptSupplierAddress = AddressSchema;

export const paymentReceiptSupplierBillingInfo = BillingInfoSchema;

export const paymentReceiptSupplierBillingInfoCz = BillingInfoCzSchema;

export const paymentReceiptItemLine = {
	id: TableIdSchema,
	paymentReceiptId: TableIdSchema,
	kind: z.enum(PaymentReceiptLineKind),
	sortOrder: PositiveIntegerSchema,
	label: NonEmptyString255Schema.nullable(),
	quantity: z.number(),
	unitOfMeasure: NonEmptyStringSchema.nullable(),
	unitPrice: IntegerSchema,
	totalAmount: IntegerSchema,
};

export const paymentReceiptNumberSeries = {
	id: TableIdSchema,
	// Number of digits used for left-padded sequence in generated receipt number.
	serialNumberDigits: PositiveIntegerSchema,
	yearFormat: z.enum(["default", "short"]),
	monthFormat: z.enum(["default", "hidden"]),
	dayFormat: z.enum(["default", "hidden"]),
	prefix: NonEmptyString32Schema.nullable(),
};

export const paymentReceiptLastNumber = {
	id: TableIdSchema,
	// Last used serial number for receipt generation.
	serialNumber: NonNegativeIntegerSchema,
	// Anchor date used for reset logic depending on configured formats.
	date: DateStringSchema.nullable(),
};
