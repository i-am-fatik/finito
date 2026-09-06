import type { Id } from "@/lib/evolu/types";
import type {
	Integer,
	NonEmptyString,
	PositiveNumber,
	Uuid7,
} from "@/lib/shared/types";

export type PaidLine = {
	itemId: Id;
	catalogItemId: Id | null;
	quantity: PositiveNumber;
	totalAmount: Integer;
};

export type PendingTablePayment = {
	subscriptionId: Uuid7;
	pubkey: string;
	qrCodeId: NonEmptyString;
	billId: Id;
	lines: ReadonlyArray<PaidLine>;
	expiresAt: number;
};

export const pendingTablePayments = () => {
	const pending = new Map<Id, PendingTablePayment>();

	const alive = (now: number) => {
		for (const [paymentId, payment] of pending) {
			if (payment.expiresAt <= now) {
				pending.delete(paymentId);
			}
		}

		return pending.values();
	};

	return {
		add: (paymentId: Id, payment: PendingTablePayment) => {
			pending.set(paymentId, payment);
		},
		quantitiesFor: (billId: Id, now: number): ReadonlyMap<Id, number> => {
			const quantities = new Map<Id, number>();
			for (const payment of alive(now)) {
				if (payment.billId !== billId) {
					continue;
				}
				for (const line of payment.lines) {
					quantities.set(
						line.itemId,
						(quantities.get(line.itemId) ?? 0) + line.quantity,
					);
				}
			}

			return quantities;
		},
		settle: (paymentId: Id): PendingTablePayment | undefined => {
			const payment = pending.get(paymentId);
			pending.delete(paymentId);

			return payment;
		},
	};
};
