import { z } from "zod";
import { TableIdSchema } from "@/lib/evolu/types";
import {
	ConstantSymbolSchema,
	Currency,
	IntegerSchema,
	NonEmptyString255Schema,
	NonEmptyStringSchema,
	SpecificSymbolSchema,
	TimestampMsSchema,
	VariableSymbolSchema,
} from "@/lib/shared/types";

export const transaction = {
	id: TableIdSchema,
	deviceId: TableIdSchema.nullable(),
	// Logical account this transaction belongs to (bank, LN wallet, cash register...).
	accountId: TableIdSchema,
	// Transaction kind discriminator (incoming/outgoing/internal transfer legs...).
	_tag: z.enum([
		"accountSpark",
		"accountLud16",
		"accountIban",
		"accountNwc",
		"accountThunderBridge",
		"accountCashRegister",
	]),
	// Signed amount in the smallest unit of account currency.
	amount: IntegerSchema,
	currency: z.enum(Currency),
	// Epoch milliseconds.
	occurredAt: TimestampMsSchema,
	note: NonEmptyStringSchema.nullable(),
	// Shared id for both legs of one internal transfer.
	internalTransferGroupId: NonEmptyString255Schema.nullable(),
};

export const transactionIban = {
	id: TableIdSchema,
	variableSymbol: VariableSymbolSchema.nullable(),
	constantSymbol: ConstantSymbolSchema.nullable(),
	specificSymbol: SpecificSymbolSchema.nullable(),
	// Provider-specific payment reference from bank statement.
	bankReference: NonEmptyString255Schema.nullable(),
};

export const transactionLud16 = {
	id: TableIdSchema,
	// Raw BOLT11 invoice, optional for imported transactions.
	lnInvoice: NonEmptyStringSchema.nullable(),
	// Payment hash for LN reconciliation.
	paymentHash: NonEmptyStringSchema,
};

export const transactionSpark = {
	id: TableIdSchema,
	// Transfer id from Spark API for deduplication.
	sparkTransferId: NonEmptyStringSchema,
	lnInvoice: NonEmptyStringSchema,
	// Proof of settlement returned by Spark.
	preImage: NonEmptyStringSchema,
	// Payment hash for LN reconciliation.
	paymentHash: NonEmptyStringSchema,
};

export const transactionNwc = {
	id: TableIdSchema,
	nwcEventId: NonEmptyStringSchema.nullable(),
	nwcRequestId: NonEmptyStringSchema.nullable(),
};

export const transactionCashRegister = {
	id: TableIdSchema,
};
