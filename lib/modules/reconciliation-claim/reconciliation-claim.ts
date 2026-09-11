import { z } from "zod";
import { TableIdSchema } from "@/lib/evolu/types";
import { IntegerSchema } from "@/lib/shared/types";

export const reconciliationClaim = {
	id: TableIdSchema,
	deviceId: TableIdSchema.nullable(),
	// Source of settlement evidence (bankTransaction/manual/cash/terminal/...).
	sourceType: z.enum(["transaction"]),
	// Identifier unique within `sourceType`. For manual sourceType use the same value as reconciliationClaim.id
	sourceId: TableIdSchema,
	// Target entity type currently expected as payment or invoice.
	entityType: z.enum(["payment", "invoice"]),
	entityId: TableIdSchema,
	// Confidence score used by reconciliation ordering.
	confidence: z.number(),
	// Matching or override rule identifier.
	rule: z.enum([
		"lnPaymentHash",
		"bankVariableSymbol",
		"manualCashRegisterSettlement",
	]),
	// Optional actor/process identifier that authored this claim.
	createdBy: z
		.enum([
			"syncLnZapTransfersProcess",
			"syncSparkTransfersProcess",
			"syncNwcTransfersProcess",
			"syncBridgeTransfersProcess",
			"syncFioTransfersProcess",
			"adminPaymentsDetail",
			"posBillCharge",
		])
		.nullable(),
};

export const reconciliationClaimAllocation = {
	id: TableIdSchema,
	// FK-like reference to reconciliationClaim.id.
	claimId: TableIdSchema,
	// Allocation bucket: product/tip/overpayment/refund.
	componentType: z.enum(["product", "tip", "overpayment", "fee"]),
	// Signed minor units (allows correction rows).
	amount: IntegerSchema,
};
