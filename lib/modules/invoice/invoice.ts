import { z } from "zod";
import { InvoicePaymentMethod } from "@/lib/evolu/model/invoice";
import { PaymentWatchingStopReason } from "@/lib/evolu/model/payment-watching-state";
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
	IbanSchema,
	IntegerSchema,
	NonEmptyString32Schema,
	NonEmptyString255Schema,
	NonNegativeIntegerSchema,
	PositiveIntegerSchema,
	TimestampMsSchema,
	Uuid7Schema,
} from "@/lib/shared/types";

export const invoice = {
	id: TableIdSchema,
	deviceId: TableIdSchema.nullable(),
	invoiceId: Uuid7Schema,
	invoiceNumber: NonEmptyString255Schema,
	issueDate: DateStringSchema,
	dueDate: DateStringSchema,
	currency: z.enum(Currency),
	paymentMethod: z.enum(InvoicePaymentMethod),
	paymentIban: IbanSchema.nullable(),
};

export const invoiceCustomer = {
	...ContactSchema,
	sourceContactId: NullableTableIdSchema,
};

export const invoiceCustomerAddress = AddressSchema;

export const invoiceCustomerBillingInfo = BillingInfoSchema;

export const invoiceCustomerBillingInfoCz = BillingInfoCzSchema;

export const invoiceSupplier = {
	...ContactSchema,
	sourceContactId: NullableTableIdSchema,
};

export const invoiceSupplierAddress = AddressSchema;

export const invoiceSupplierBillingInfo = BillingInfoSchema;

export const invoiceSupplierBillingInfoCz = BillingInfoCzSchema;

export const invoiceItemLine = {
	id: TableIdSchema,
	invoiceId: TableIdSchema,
	catalogItemId: NullableTableIdSchema,
	itemId: TableIdSchema,
	quantity: z.number(),
	totalAmount: IntegerSchema, // In invoice currency, not in item currency.
};

export const invoiceWatchingState = {
	id: TableIdSchema,
	// Epoch milliseconds when watcher marked payment as verified.
	verifiedAt: TimestampMsSchema.nullable(),
	// Verification source/type
	proveType: z.enum(["lnZap", "lnSpark"]).nullable(),
	// Related transaction id created by verification process.
	transactionId: NullableTableIdSchema,
	// Epoch milliseconds when active watching was interrupted.
	stoppedAt: TimestampMsSchema.nullable(),
	// Reason for stopping active watching.
	stopReason: z.enum(PaymentWatchingStopReason).nullable(),
};

export const invoiceNumberSeries = {
	id: TableIdSchema,
	// Number of digits used for left-padded sequence in generated invoice number.
	serialNumberDigits: PositiveIntegerSchema,
	yearFormat: z.enum(["default", "short"]),
	monthFormat: z.enum(["default", "hidden"]),
	dayFormat: z.enum(["default", "hidden"]),
	prefix: NonEmptyString32Schema.nullable(),
};

export const invoiceLastNumber = {
	id: TableIdSchema,
	// Last used serial number for invoice generation.
	serialNumber: NonNegativeIntegerSchema,
	// Anchor date used for reset logic depending on configured formats.
	date: DateStringSchema.nullable(),
};
