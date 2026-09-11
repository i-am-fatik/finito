import { z } from "zod";
import { TableIdSchema } from "@/lib/evolu/types";
import { AddressSchema } from "@/lib/modules/shared/schema";
import {
	CountryCode,
	EmailSchema,
	IdentificationNumberCzSchema,
	NonEmptyString255Schema,
	SqliteBoolSchema,
} from "@/lib/shared/types";

export const client = {
	id: TableIdSchema,
	deviceId: TableIdSchema.nullable(),
	name: NonEmptyString255Schema,
	label: NonEmptyString255Schema.nullable(),
	email: EmailSchema.nullable(),
	countryCode: z.enum(CountryCode),
};

export const clientAddress = AddressSchema;

export const clientCz = {
	id: TableIdSchema,
	vatPayer: SqliteBoolSchema.nullable(),
	identificationNumber: IdentificationNumberCzSchema.nullable(),
	vatNumber: NonEmptyString255Schema.nullable(),
	caseNumber: NonEmptyString255Schema.nullable(),
};
