import { ItemSchema, NullableTableIdSchema } from "@/lib/modules/shared/schema";

export const item = {
	...ItemSchema,
	// Link to the original catalog item.
	// It can be null when the item is used without original catalog item.
	catalogItemId: NullableTableIdSchema,
};
