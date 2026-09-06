import {
	evoluJsonObjectFrom,
	type KyselyNotNull,
	sqliteTrue,
} from "@evolu/common";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useBill } from "@/hooks/use-bill";
import { useEvoluQuery } from "@/hooks/use-evolu-query";
import { createQuery } from "@/lib/evolu";
import type { Id } from "@/lib/evolu/types";
import { resolvePaymentStatus } from "@/lib/payment/service";
import { isSettled } from "@/lib/pos/bill-status";
import type { Integer } from "@/lib/shared/types";

export const chargedBillsQuery = createQuery((db) =>
	db
		.selectFrom("posBill")
		.innerJoin("payment", "payment.id", "posBill.paymentId")
		.leftJoin("table", "table.id", "posBill.tableId")
		.select(
			(eb) =>
				[
					"posBill.id as id",
					"posBill.displayId as displayId",
					"posBill.label as label",
					"table.label as tableLabel",
					"payment.totalAmount as totalAmount",
					evoluJsonObjectFrom(
						eb
							.selectFrom("reconciliationClaim")
							.innerJoin(
								"reconciliationClaimAllocation",
								"reconciliationClaimAllocation.claimId",
								"reconciliationClaim.id",
							)
							.select(
								(eb) =>
									[
										eb.fn
											.sum<Integer | null>(
												"reconciliationClaimAllocation.amount",
											)
											.as("amount"),
									] as const,
							)
							.whereRef("reconciliationClaim.entityId", "=", "payment.id")
							.where("reconciliationClaim.isDeleted", "is not", sqliteTrue)
							.where(
								"reconciliationClaimAllocation.isDeleted",
								"is not",
								sqliteTrue,
							)
							.where("reconciliationClaim.entityType", "=", "payment"),
					).as("reconciliationClaim"),
				] as const,
		)
		.where("posBill.isDeleted", "is not", sqliteTrue)
		.where("posBill.closedAt", "is", null)
		.where("posBill.displayId", "is not", null)
		.where("payment.isDeleted", "is not", sqliteTrue)
		.where("payment.totalAmount", "is not", null)
		.$narrowType<{
			displayId: KyselyNotNull;
			totalAmount: KyselyNotNull;
			reconciliationClaim: KyselyNotNull;
		}>(),
);

export const useSettlePaidBills = () => {
	const { t } = useTranslation();
	const { closeBill } = useBill();
	const { data: chargedBills } = useEvoluQuery(chargedBillsQuery);
	const closing = useRef(new Set<Id>());

	useEffect(() => {
		for (const bill of chargedBills) {
			const settled = isSettled(
				resolvePaymentStatus({
					payment: {
						totalAmount: bill.totalAmount,
						reconciliationClaim: {
							amount: bill.reconciliationClaim.amount,
						},
					},
				}),
			);
			if (!settled || closing.current.has(bill.id)) {
				continue;
			}

			closing.current.add(bill.id);
			closeBill({ billId: bill.id });
			toast.success(
				t("pos:bill.paid", {
					label: bill.tableLabel ?? bill.label ?? `#${bill.displayId}`,
				}),
			);
		}
	}, [chargedBills, closeBill, t]);
};
