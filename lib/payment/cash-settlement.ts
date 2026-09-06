import { createId, createIdFromString, createRandomBytes } from "@evolu/common";
import type { Id } from "@/lib/evolu/types";
import type { EvoluDep } from "@/lib/shared/dependencies";
import {
	type Currency,
	type Integer,
	NonEmptyString,
} from "@/lib/shared/types";

export const settlePaymentInCash =
	(deps: EvoluDep) =>
	(params: {
		paymentId: Id;
		amount: Integer;
		currency: Currency;
		cashAccountId: Id;
	}) => {
		const transactionId = createId({ randomBytes: createRandomBytes() });
		deps.evolu.upsert("transaction", {
			id: transactionId,
			accountId: params.cashAccountId,
			_tag: "accountCashRegister",
			amount: params.amount,
			currency: params.currency,
			occurredAt: Date.now(),
			note: NonEmptyString("Manual cash register settlement"),
			internalTransferGroupId: null,
		});
		deps.evolu.upsert("transactionCashRegister", {
			id: transactionId,
		});

		const claimId = createIdFromString(
			`reconciliationClaim:transaction:${transactionId}:payment:${params.paymentId}`,
		);
		deps.evolu.upsert("reconciliationClaim", {
			id: claimId,
			sourceType: "transaction",
			sourceId: transactionId,
			entityType: "payment",
			entityId: params.paymentId,
			confidence: 1,
			rule: "manualCashRegisterSettlement",
			createdBy: "posBillCharge",
		});
		deps.evolu.upsert("reconciliationClaimAllocation", {
			id: createIdFromString(
				`reconciliationClaimAllocation:${claimId}:product`,
			),
			claimId,
			componentType: "product",
			amount: params.amount,
		});

		return transactionId;
	};
