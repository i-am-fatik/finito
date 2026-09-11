import { z } from "zod";
import { TableIdSchema } from "@/lib/evolu/types";
import {
	EmailSchema,
	FiatCurrency,
	HttpsUrlSchema,
	IbanSchema,
	NonEmptyString255Schema,
	NwcCredentialsSchema,
} from "@/lib/shared/types";

export const account = {
	id: TableIdSchema,
	deviceId: TableIdSchema.nullable(),
	name: NonEmptyString255Schema,
	// Account kind discriminator
	_tag: z.enum([
		"accountIban",
		"accountLud16",
		"accountSpark",
		"accountNwc",
		"accountThunderBridge",
		"accountCashRegister",
	]),
};

export const accountIban = {
	id: TableIdSchema,
	iban: IbanSchema,
	currency: z.enum(FiatCurrency),
};

export const accountLud16 = {
	id: TableIdSchema,
	lud16: EmailSchema,
	gatewayUrl: HttpsUrlSchema.nullable(),
	gatewayToken: NonEmptyString255Schema.nullable(),
};

export const accountThunderBridge = {
	id: TableIdSchema,
	gatewayUrl: HttpsUrlSchema,
	gatewayToken: NonEmptyString255Schema.nullable(),
	lud16: EmailSchema.nullable(),
	iban: IbanSchema.nullable(),
	fioReadToken: NonEmptyString255Schema.nullable(),
};

export const accountSpark = {
	id: TableIdSchema,
	mnemonic: NonEmptyString255Schema,
};

export const accountNwc = {
	id: TableIdSchema,
	credentials: NwcCredentialsSchema,
};

export const accountCashRegister = {
	id: TableIdSchema,
	currency: z.enum(FiatCurrency),
};
