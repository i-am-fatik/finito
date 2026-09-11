import { z } from "zod";
import { TableIdSchema } from "@/lib/evolu/types";
import {
	CountryCode,
	DateStringSchema,
	NonEmptyString32Schema,
	NonEmptyString255Schema,
	NonNegativeIntegerSchema,
	TimeStringSchema,
	Timezone,
} from "@/lib/shared/types";

const Weekday = {
	mon: "mon",
	tue: "tue",
	wed: "wed",
	thu: "thu",
	fri: "fri",
	sat: "sat",
	sun: "sun",
} as const;

export const openingHoursSettings =
	// Opening hours evaluation priority (highest to lowest):
	// 1) openingHoursExceptionDay (+ openingHoursExceptionSlot for mode="custom")
	// 2) global holiday policy in openingHoursSettings
	// 3) openingHoursRegularSlot
	{
		id: TableIdSchema,
		deviceId: TableIdSchema.nullable(),
		timezone: z.enum(Timezone),
		holidayMode: z.enum(["manualOnly", "closeOnPublicHolidays"]),
		holidayCountryCode: z.enum(CountryCode).nullable(),
		holidayRegionCode: NonEmptyString32Schema.nullable(),
		holidayObservedMode: z.enum(["none", "observed"]),
	};

export const openingHoursRegularSlot = {
	id: TableIdSchema,
	openingHoursSettingsId: TableIdSchema,
	weekday: z.enum(Weekday),
	// Local wall-clock time in openingHoursSettings.timezone.
	openMinute: TimeStringSchema,
	// Local wall-clock time in openingHoursSettings.timezone.
	closeMinute: TimeStringSchema,
	sortOrder: NonNegativeIntegerSchema,
	// Optional seasonal applicability for this regular slot.
	validFrom: DateStringSchema.nullable(),
	// Optional seasonal applicability for this regular slot.
	validTo: DateStringSchema.nullable(),
};

export const openingHoursExceptionDay = {
	id: TableIdSchema,
	openingHoursSettingsId: TableIdSchema,
	date: DateStringSchema,
	mode: z.enum(["closed", "custom"]),
	note: NonEmptyString255Schema.nullable(),
};

export const openingHoursExceptionSlot = {
	id: TableIdSchema,
	openingHoursExceptionDayId: TableIdSchema,
	// Local wall-clock time in openingHoursSettings.timezone.
	openMinute: TimeStringSchema,
	// Local wall-clock time in openingHoursSettings.timezone.
	closeMinute: TimeStringSchema,
	sortOrder: NonNegativeIntegerSchema,
};
