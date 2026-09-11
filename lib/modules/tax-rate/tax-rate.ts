import { TableIdSchema } from "@/lib/evolu/types";
import { NonEmptyString255Schema, PercentSchema } from "@/lib/shared/types";

export const billingSettingsTaxRate = {
	id: TableIdSchema,
	name: NonEmptyString255Schema.nullable(),
	rate: PercentSchema,
};
