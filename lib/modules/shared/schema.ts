import { z } from "zod";
import { TableIdSchema } from "@/lib/evolu/types";
import {
	CountryCode,
	Currency,
	EmailSchema,
	IdentificationNumberCzSchema,
	IntegerSchema,
	NonEmptyString32Schema,
	NonEmptyString255Schema,
	NonEmptyStringSchema,
	PhoneSchema,
	ProductCodeType,
	SqliteBoolSchema,
} from "@/lib/shared/types";

export const NullableTableIdSchema = TableIdSchema.nullable();

export const AddressSchema = {
	id: TableIdSchema,
	street: NonEmptyString255Schema.nullable(),
	descriptiveNumber: NonEmptyString32Schema.nullable(),
	city: NonEmptyString255Schema.nullable(),
	postalCode: NonEmptyString32Schema.nullable(),
};

export const ContactSchema = {
	id: TableIdSchema,
	name: NonEmptyString255Schema,
	label: NonEmptyString255Schema.nullable(),
	email: EmailSchema.nullable(),
	phone: PhoneSchema.nullable(),
};

export const BillingInfoSchema = {
	id: TableIdSchema,
	countryCode: z.enum(CountryCode),
};

export const BillingInfoCzSchema = {
	id: TableIdSchema,
	vatPayer: SqliteBoolSchema.nullable(),
	identificationNumber: IdentificationNumberCzSchema.nullable(),
	vatNumber: NonEmptyString255Schema.nullable(),
	caseNumber: NonEmptyString255Schema.nullable(),
};

export const ItemSchema = {
	id: TableIdSchema,
	label: NonEmptyString255Schema,
	// Stored in minor units for `priceCurrency` (e.g. cents, satoshis).
	price: IntegerSchema,
	unitOfMeasure: NonEmptyStringSchema.nullable(),
	internalCode: NonEmptyStringSchema.nullable(),
	productCodeType: z.enum(ProductCodeType).nullable(),
	productCodeValue: NonEmptyStringSchema.nullable(),
	categoryId: NullableTableIdSchema,
	currency: z.enum(Currency),
} as const;
