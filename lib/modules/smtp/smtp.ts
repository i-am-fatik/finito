import { TableIdSchema } from "@/lib/evolu/types";
import {
	EmailSchema,
	NonEmptyStringSchema,
	PositiveIntegerSchema,
} from "@/lib/shared/types";

export const smtp = {
	id: TableIdSchema,
	server: NonEmptyStringSchema,
	port: PositiveIntegerSchema,
	username: NonEmptyStringSchema,
	password: NonEmptyStringSchema,
	name: NonEmptyStringSchema.nullable(),
	email: EmailSchema,
};
