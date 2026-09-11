import { z } from "zod";
import { TableIdSchema } from "@/lib/evolu/types";
import { NonEmptyString255Schema } from "@/lib/shared/types";

export const device = {
	id: TableIdSchema,
	name: NonEmptyString255Schema,
	deviceType: z.string().nullable(),
	deviceVendor: z.string().nullable(),
	browserName: z.string().nullable(),
	osName: z.string().nullable(),
};
