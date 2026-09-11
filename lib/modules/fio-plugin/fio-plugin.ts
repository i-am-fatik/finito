import { TableIdSchema } from "@/lib/evolu/types";
import {
	HttpsUrlSchema,
	NonEmptyString255Schema,
	PositiveIntegerSchema,
	SqliteBoolSchema,
} from "@/lib/shared/types";

export const fioPlugin = {
	id: TableIdSchema,
	apiUrl: HttpsUrlSchema,
	// Polling interval in seconds.
	numberOfSecondsBetweenChecks: PositiveIntegerSchema,
	// Hard switch for FIO sync background process.
	isActive: SqliteBoolSchema,
};

export const fioPluginToken = {
	id: TableIdSchema,
	// FK to owning FIO plugin configuration.
	fioPluginId: TableIdSchema,
	token: NonEmptyString255Schema,
};
