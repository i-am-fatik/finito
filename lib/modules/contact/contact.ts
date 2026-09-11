import { z } from "zod";
import { TableIdSchema } from "@/lib/evolu/types";
import { AddressSchema, ContactSchema } from "@/lib/modules/shared/schema";
import {
	CountryCode,
	EmailSchema,
	FiatCurrency,
	IbanSchema,
	IdentificationNumberCzSchema,
	NonEmptyString255Schema,
	NonEmptyStringSchema,
	SqliteBoolSchema,
} from "@/lib/shared/types";

export const contact = {
	...ContactSchema,
	deviceId: TableIdSchema.nullable(),
};

export const contactAccount = {
	id: TableIdSchema,
	contactId: TableIdSchema,
	deviceId: TableIdSchema.nullable(),
	name: NonEmptyString255Schema.nullable(),
	// Account kind discriminator
	_tag: z.enum(["accountIban", "accountLud16"]),
};

export const contactAccountIban = {
	id: TableIdSchema,
	iban: IbanSchema,
	currency: z.enum(FiatCurrency),
};

export const contactAccountLud16 = {
	id: TableIdSchema,
	lud16: EmailSchema,
};

export const contactNostr = {
	id: TableIdSchema,
	contactId: TableIdSchema,
	npub: NonEmptyStringSchema,
	name: NonEmptyString255Schema.nullable(),
};

export const contactAddress = AddressSchema;

export const contactBillingInfo = {
	id: TableIdSchema,
	countryCode: z.enum(CountryCode),
};

export const contactBillingInfoCz = {
	id: TableIdSchema,
	vatPayer: SqliteBoolSchema.nullable(),
	identificationNumber: IdentificationNumberCzSchema.nullable(),
	vatNumber: NonEmptyString255Schema.nullable(),
	caseNumber: NonEmptyString255Schema.nullable(),
};
