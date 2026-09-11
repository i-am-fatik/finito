import { z } from "zod";
import { InvoicePaymentMethod } from "@/lib/evolu/model/invoice";
import { PaymentMethod } from "@/lib/evolu/model/payment";
import { TableIdSchema } from "@/lib/evolu/types";
import { NullableTableIdSchema } from "@/lib/modules/shared/schema";
import {
	Currency,
	ExchangeRateSource,
	NonEmptyString255Schema,
	NonEmptyStringSchema,
	NonNegativeIntegerSchema,
	SqliteBoolSchema,
	Timezone,
} from "@/lib/shared/types";

export const billingSettings = {
	id: TableIdSchema,
	ownContactId: TableIdSchema.nullable(),
	venueName: NonEmptyString255Schema.nullable(),
	defaultCurrency: z.enum(Currency),
	defaultTimezone: z.enum(Timezone),
	exchangeRateSource: z.enum(ExchangeRateSource).nullable(),
	// Optional FK to account row used for bank transfer defaults.
	defaultPaymentMethodBankAccountKey: NullableTableIdSchema,
	defaultPaymentMethod: z.enum(PaymentMethod),
	// Optional FK to payment option config rows.
	defaultBankTransferCzKey: NullableTableIdSchema,
	defaultLnZapKey: NullableTableIdSchema,
	defaultLnSparkKey: NullableTableIdSchema,
};

export const invoiceSettings = {
	id: TableIdSchema,
	defaultDueDateDays: NonNegativeIntegerSchema,
	// Persisted invoice payment method used as default for new invoices.
	defaultPaymentMethod: z.enum(InvoicePaymentMethod).nullable(),
};

export const invoiceEmailSettings = {
	id: TableIdSchema,
	enable: SqliteBoolSchema,
	subject: NonEmptyString255Schema.nullable(),
	// Templated email body that can include placeholders.
	body: NonEmptyStringSchema.nullable(),
};
