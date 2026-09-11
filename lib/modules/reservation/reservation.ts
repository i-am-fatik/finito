import { z } from "zod";
import { TableIdSchema } from "@/lib/evolu/types";
import { NullableTableIdSchema } from "@/lib/modules/shared/schema";
import {
	EmailSchema,
	NonEmptyString255Schema,
	NonEmptyStringSchema,
	PhoneSchema,
	PositiveIntegerSchema,
	TimestampMsSchema,
} from "@/lib/shared/types";

export const reservation = {
	id: TableIdSchema,
	deviceId: TableIdSchema.nullable(),
	tableId: NullableTableIdSchema,
	note: NonEmptyStringSchema.nullable(),
	// Reservation type discriminator (booking/block/...).
	_tag: z.enum(["booking", "block"]),
	// Epoch milliseconds.
	startAt: TimestampMsSchema,
	// Epoch milliseconds.
	endAt: TimestampMsSchema,
};

export const reservationBooking = {
	id: TableIdSchema,
	name: NonEmptyString255Schema,
	phone: PhoneSchema.nullable(),
	email: EmailSchema.nullable(),
	numberOfPeople: PositiveIntegerSchema,
	approvalStatus: z.enum(["pending", "approved", "rejected"]),
	serviceStatus: z.enum(["upcoming", "seated", "noShow", "completed"]),
	statusReason: NonEmptyStringSchema.nullable(),
	source: z.enum(["manual", "phone", "web"]).nullable(),
};

export const reservationBlock = {
	id: TableIdSchema,
	label: NonEmptyString255Schema,
};
