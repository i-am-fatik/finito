import { z } from "zod";
import { PaymentDefaultMethodType } from "@/lib/evolu/model/payment-default-method";
import { TableIdSchema } from "@/lib/evolu/types";
import { TimestampMsSchema } from "@/lib/shared/types";

export const paymentDefaultMethod = {
	id: TableIdSchema,
	type: z.enum(PaymentDefaultMethodType),
	accountId: TableIdSchema,
	pausedAt: TimestampMsSchema.nullable(),
};
