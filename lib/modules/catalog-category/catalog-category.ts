import { TableIdSchema } from "@/lib/evolu/types";
import { NonEmptyString255Schema } from "@/lib/shared/types";

export const category = {
	id: TableIdSchema,
	deviceId: TableIdSchema.nullable(),
	name: NonEmptyString255Schema,
};
