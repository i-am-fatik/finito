import { z } from "zod";
import { PaymentWatchingStopReason } from "@/lib/evolu/model/payment-watching-state";
import { TableIdSchema } from "@/lib/evolu/types";
import {
	ContactSchema,
	NullableTableIdSchema,
} from "@/lib/modules/shared/schema";
import {
	Currency,
	HttpsUrlSchema,
	IbanSchema,
	IntegerSchema,
	NonEmptyString255Schema,
	NonEmptyStringSchema,
	NonNegativeIntegerSchema,
	TimestampMsSchema,
	TimestampSecSchema,
	VariableSymbolSchema,
} from "@/lib/shared/types";

export const payment = {
	id: TableIdSchema,
	deviceId: TableIdSchema.nullable(),
	// Payment flow type discriminator (static/dynamic/...).
	// type: z.enum(["lnZap", "lnSpark", "bankTransferCZ", "cash"]),
	direction: z.enum(["incoming", "outgoing"]),
	// Includes tipAmount and sum of all paymentItems
	totalAmount: IntegerSchema,
	currency: z.enum(Currency),
	// Optional expected tip amount in minor units.
	tipAmount: NonNegativeIntegerSchema.nullable(),
};

export const paymentCounterparty = {
	...ContactSchema,
	sourceContactId: NullableTableIdSchema,
};

export const paymentWebData = {
	id: TableIdSchema,
	merchantName: NonEmptyStringSchema.nullable(),
	// Optional tag/event emitted after successful settlement.
	onSuccessfulPaymentTag: z.enum(["httpRedirect"]).nullable(),
	// Optional redirect after successful settlement.
	onSuccessfulPaymentRedirectUrl: HttpsUrlSchema.nullable(),
	privateKey: NonEmptyStringSchema,
	// // External event id used by web payment flow.
	webPaymentEventId: NonEmptyStringSchema,
};

export const paymentItemLine =
	// It's optional. The payment does not have to contain the definition of the items.
	{
		id: TableIdSchema,
		paymentId: TableIdSchema,
		catalogItemId: NullableTableIdSchema,
		itemId: TableIdSchema,
		posBillId: NullableTableIdSchema,
		posBillItemId: NullableTableIdSchema,
		quantity: z.number(),
		totalAmount: IntegerSchema, // In invoice currency, not in item currency.
		optionalityChecked: NonNegativeIntegerSchema.nullable(),
	};

export const paymentLnZap = {
	id: TableIdSchema,
	// Target account for mirrored incoming LN transaction after verification.
	accountId: TableIdSchema,
	lnInvoice: NonEmptyStringSchema,
	// Payment hash for LN reconciliation.
	paymentHash: NonEmptyStringSchema,
	privateKey: NonEmptyStringSchema,
	walletPubkey: NonEmptyStringSchema,
	// Satoshis.
	amount: NonNegativeIntegerSchema,
	// UNIX timestamp in seconds (invoice expiry).
	expirationIn: TimestampSecSchema,
};

export const paymentLnSpark = {
	id: TableIdSchema,
	accountId: TableIdSchema,
	lnInvoice: NonEmptyStringSchema,
	// Payment hash for LN reconciliation.
	paymentHash: NonEmptyStringSchema,
	// Identifier returned by Spark invoice API.
	sparkInvoiceId: NonEmptyStringSchema,
	// Satoshis.
	amount: NonNegativeIntegerSchema,
	// UNIX timestamp in seconds (invoice expiry).
	expirationIn: TimestampSecSchema,
};

export const paymentLnNwc = {
	id: TableIdSchema,
	accountId: TableIdSchema,
	lnInvoice: NonEmptyStringSchema,
	// Payment hash for LN reconciliation.
	paymentHash: NonEmptyStringSchema,
	// Satoshis.
	amount: NonNegativeIntegerSchema,
	// UNIX timestamp in seconds (invoice expiry).
	expirationIn: TimestampSecSchema,
};

export const paymentLnBridge = {
	id: TableIdSchema,
	accountId: TableIdSchema,
	lnInvoice: NonEmptyStringSchema,
	paymentHash: NonEmptyStringSchema,
	gatewayPaymentId: NonEmptyString255Schema,
	amount: NonNegativeIntegerSchema,
	expirationIn: TimestampSecSchema,
};

export const paymentBankTransferCZ = {
	id: TableIdSchema,
	iban: IbanSchema,
	variableSymbol: VariableSymbolSchema,
};

export const paymentCash = {
	id: TableIdSchema,
	// Cash register account where the cash settlement is recorded.
	accountId: NullableTableIdSchema,
};

export const paymentWatchingState = {
	id: TableIdSchema,
	// Epoch milliseconds when watcher marked payment as verified.
	verifiedAt: TimestampMsSchema.nullable(),
	// Verification source/type
	proveType: z
		.enum(["lnZap", "lnSpark", "lnNwc", "lnBridge", "bankTransferCZ"])
		.nullable(),
	// Related transaction id created by verification process.
	transactionId: NullableTableIdSchema,
	// Epoch milliseconds when active watching was interrupted.
	stoppedAt: TimestampMsSchema.nullable(),
	// Reason for stopping active watching.
	stopReason: z.enum(PaymentWatchingStopReason).nullable(),
};
