import { PaymentStatus } from "@/lib/evolu/model/payment-status";
import {
	PaymentWatchingStatus,
	PaymentWatchingStopReason,
	resolvePaymentWatchingStatus,
} from "@/lib/evolu/model/payment-watching-state";
import type { InferEnumType } from "@/lib/shared/types";

export const BillStatus = {
	Open: "open",
	Charging: "charging",
	Closed: "closed",
} as const;
export type BillStatus = InferEnumType<typeof BillStatus>;

export const resolveBillStatus = (bill: {
	closedAt: number | null;
	paymentId: string | null;
}): BillStatus =>
	bill.closedAt !== null
		? BillStatus.Closed
		: bill.paymentId !== null
			? BillStatus.Charging
			: BillStatus.Open;

export const ChargeState = {
	Awaiting: "awaiting",
	Paid: "paid",
	Expired: "expired",
	Stopped: "stopped",
} as const;
export type ChargeState = InferEnumType<typeof ChargeState>;

export const isSettled = (paymentStatus: PaymentStatus) =>
	paymentStatus === PaymentStatus.Paid ||
	paymentStatus === PaymentStatus.Overpaid;

export const resolveChargeState = (params: {
	paymentStatus: PaymentStatus;
	expiresAt: number | null;
	watching: {
		verifiedAt: number | null;
		stoppedAt: number | null;
		stopReason: PaymentWatchingStopReason | null;
	} | null;
	now: number;
}): ChargeState => {
	if (isSettled(params.paymentStatus)) {
		return ChargeState.Paid;
	}
	if (params.expiresAt !== null && params.expiresAt <= params.now) {
		return ChargeState.Expired;
	}
	if (
		params.watching !== null &&
		resolvePaymentWatchingStatus(params.watching) ===
			PaymentWatchingStatus.Stopped
	) {
		return params.watching.stopReason === PaymentWatchingStopReason.Timeout
			? ChargeState.Expired
			: ChargeState.Stopped;
	}

	return ChargeState.Awaiting;
};
