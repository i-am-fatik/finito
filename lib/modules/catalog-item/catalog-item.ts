import { TableIdSchema } from "@/lib/evolu/types";
import { ItemSchema } from "@/lib/modules/shared/schema";
import { IntegerSchema } from "@/lib/shared/types";

export const catalogItem = {
	...ItemSchema,
	// Internal reference cost in item currency for margin checks.
	costPrice: IntegerSchema.nullable(),
	deviceId: TableIdSchema.nullable(),
};
