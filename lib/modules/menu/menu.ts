import { z } from "zod";
import { MenuStatus } from "@/lib/evolu/model/menu";
import { TableIdSchema } from "@/lib/evolu/types";
import { NullableTableIdSchema } from "@/lib/modules/shared/schema";
import { NonEmptyString255Schema, TimestampMsSchema } from "@/lib/shared/types";

export const menu = {
	id: TableIdSchema,
	deviceId: TableIdSchema.nullable(),
	name: NonEmptyString255Schema,
	// Workflow state of menu publication.
	status: z.enum(MenuStatus),
	validFrom: TimestampMsSchema.nullable(),
	validTo: TimestampMsSchema.nullable(),
	publishedAt: TimestampMsSchema.nullable(),
};

export const menuCategory = {
	id: TableIdSchema,
	menuId: TableIdSchema,
	name: NonEmptyString255Schema,
};

export const menuItemLine = {
	id: TableIdSchema,
	menuCategoryId: TableIdSchema,
	catalogItemId: NullableTableIdSchema,
	itemId: TableIdSchema,
	// `null` = available` for menu-specific availability.
	availabilityStatus: z.enum(["soldOut", "hidden"]).nullable(),
};
