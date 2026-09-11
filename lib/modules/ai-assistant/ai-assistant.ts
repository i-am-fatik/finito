import { z } from "zod";
import { AiAgentScope } from "@/lib/evolu/model/ai-agent";
import { TableIdSchema } from "@/lib/evolu/types";
import {
	NonEmptyString255Schema,
	NonEmptyStringSchema,
	TimestampMsSchema,
} from "@/lib/shared/types";

export const aiAssistantSettings = {
	id: TableIdSchema,
	googleApiKey: NonEmptyStringSchema.nullable(),
};

export const aiAgent = {
	id: TableIdSchema,
	deviceId: TableIdSchema.nullable(),
	label: NonEmptyString255Schema,
	tokenHash: NonEmptyStringSchema,
	lastUsedAt: TimestampMsSchema.nullable(),
};

export const aiAgentScope = {
	id: TableIdSchema,
	aiAgentId: TableIdSchema,
	scope: z.enum(AiAgentScope),
};
