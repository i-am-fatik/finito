import { TableIdSchema } from "@/lib/evolu/types";
import {
	NonEmptyString255Schema,
	PositiveIntegerSchema,
} from "@/lib/shared/types";

export const table = {
	id: TableIdSchema,
	deviceId: TableIdSchema.nullable(),
	label: NonEmptyString255Schema,
	numberOfSeats: PositiveIntegerSchema,
};

export const tableCode = {
	id: TableIdSchema,
	tableId: TableIdSchema,
	code: NonEmptyString255Schema,
};
