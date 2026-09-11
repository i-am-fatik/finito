import { createIdFromString, type Id, sqliteTrue } from "@evolu/common";
import {
	GatewayCheatError,
	preimageMatchesHash,
	ThunderBridge,
} from "thunder-bridge";
import type { BackgroundProcess } from "@/lib/background/service";
import { createQuery } from "@/lib/evolu";
import { PaymentWatchingStopReason } from "@/lib/evolu/model/payment-watching-state";
import { subscribeToEvoluQuery } from "@/lib/evolu/utils";
import { createUpsertLnPaymentHashReconciliationClaims } from "@/lib/reconciliation/service";
import { Currency, NonEmptyString, TimestampMs } from "@/lib/shared/types";
import { extractBtcAmountFromLightningInvoice } from "@/lib/shared/utils/ln";

const notificationId = createIdFromString("syncBridgeTransfers");
const notificationTitle = "Lightning gateway";
const retryDelayMs = 30_000;

type WatchedBridgePayment = {
	id: Id;
	accountId: Id;
	lnInvoice: NonEmptyString;
	paymentHash: NonEmptyString;
	gatewayPaymentId: NonEmptyString;
	expirationIn: number;
	gatewayUrl: string;
	gatewayToken: string | null;
};

const delay = (ms: number, signal: AbortSignal) =>
	new Promise<void>((resolve) => {
		const done = () => {
			clearTimeout(timer);
			signal.removeEventListener("abort", done);
			resolve();
		};
		const timer = setTimeout(done, ms);
		signal.addEventListener("abort", done, { once: true });
	});

export const syncBridgeTransfersProcess: BackgroundProcess = {
	name: "syncBridgeTransfers",
	run: async (props) => {
		const notification = props.addNotification({
			title: notificationTitle,
			type: "info",
			progress: null,
			canBeClosed: true,
			description: "Watching gateway payments...",
			isUnread: false,
			id: notificationId,
			timestamp: Date.now(),
		});
		const followed = new Map<Id, AbortController>();
		let verifiedCount = 0;

		const upsertPaymentMatchingClaims =
			createUpsertLnPaymentHashReconciliationClaims({ evolu: props.evolu });

		const report = (
			type: "info" | "success" | "error",
			description: string,
		) => {
			notification.update({
				title: notificationTitle,
				type,
				progress: null,
				canBeClosed: true,
				description,
				isUnread: false,
				id: notificationId,
				timestamp: Date.now(),
			});
		};

		const stopWatching = (
			paymentId: Id,
			stopReason: PaymentWatchingStopReason,
		) => {
			props.evolu.update("paymentWatchingState", {
				id: paymentId,
				stoppedAt: TimestampMs(Date.now()),
				stopReason,
			});
		};

		const settle = async (payment: WatchedBridgePayment, preimage: string) => {
			if (!preimageMatchesHash(preimage, payment.paymentHash)) {
				stopWatching(payment.id, PaymentWatchingStopReason.Error);
				report(
					"error",
					`The gateway reported a preimage that does not hash to payment ${payment.id}.`,
				);
				return;
			}

			const transactionId = createIdFromString(`lnBridge:${payment.id}`);

			try {
				const amount = extractBtcAmountFromLightningInvoice(payment.lnInvoice);

				props.evolu.upsert("transaction", {
					id: transactionId,
					accountId: payment.accountId,
					_tag: "accountThunderBridge",
					amount,
					currency: Currency.BTC,
					occurredAt: TimestampMs(Date.now()),
					note: NonEmptyString(
						"Incoming LN payment proved through the gateway",
					),
					internalTransferGroupId: null,
				});
				props.evolu.upsert("transactionLud16", {
					id: transactionId,
					lnInvoice: payment.lnInvoice,
					paymentHash: payment.paymentHash,
				});
				await upsertPaymentMatchingClaims({
					transactionId,
					accountId: payment.accountId,
					paymentHash: payment.paymentHash,
					amount,
					source: "paymentLnBridge",
					createdBy: "syncBridgeTransfersProcess",
				});
				props.evolu.update("paymentWatchingState", {
					id: payment.id,
					verifiedAt: TimestampMs(Date.now()),
					proveType: "lnBridge",
					transactionId,
				});
			} catch (error) {
				stopWatching(payment.id, PaymentWatchingStopReason.Error);
				report(
					"error",
					`Payment ${payment.id} was paid but could not be recorded, reconcile it by hand: ${error instanceof Error ? error.message : String(error)}`,
				);
				return;
			}

			verifiedCount += 1;
			report("success", `Verified ${verifiedCount} gateway payment(s).`);
		};

		const follow = (payment: WatchedBridgePayment) => {
			const controller = new AbortController();
			followed.set(payment.id, controller);
			const gateway = new ThunderBridge(payment.gatewayUrl, {
				token: payment.gatewayToken ?? undefined,
			});

			void (async () => {
				while (!controller.signal.aborted) {
					try {
						const outcome = await gateway.waitForPayment(
							payment.gatewayPaymentId,
							{ signal: controller.signal },
						);
						if (outcome.status === "expired") {
							stopWatching(payment.id, PaymentWatchingStopReason.Timeout);
							return;
						}
						if (outcome.status === "paid") {
							if (outcome.preimage === null) {
								stopWatching(payment.id, PaymentWatchingStopReason.Error);
							} else {
								await settle(payment, outcome.preimage);
							}
							return;
						}
					} catch (error) {
						if (controller.signal.aborted) {
							return;
						}
						if (error instanceof GatewayCheatError) {
							stopWatching(payment.id, PaymentWatchingStopReason.Error);
							report(
								"error",
								`The gateway's answer on payment ${payment.id} failed verification: ${error.message}`,
							);
							return;
						}
						report(
							"error",
							error instanceof Error
								? `Gateway unreachable: ${error.message}`
								: "Gateway unreachable.",
						);
					}

					await delay(retryDelayMs, controller.signal);

					if (Date.now() >= payment.expirationIn * 1000) {
						stopWatching(payment.id, PaymentWatchingStopReason.Timeout);
						return;
					}
				}
			})();
		};

		const watchedPaymentsQuery = createQuery((db) =>
			db
				.selectFrom("payment")
				.innerJoin("paymentLnBridge", "paymentLnBridge.id", "payment.id")
				.innerJoin(
					"paymentWatchingState",
					"paymentWatchingState.id",
					"payment.id",
				)
				.innerJoin(
					"accountThunderBridge",
					"accountThunderBridge.id",
					"paymentLnBridge.accountId",
				)
				.select([
					"payment.id as id",
					"paymentLnBridge.accountId as accountId",
					"paymentLnBridge.lnInvoice as lnInvoice",
					"paymentLnBridge.paymentHash as paymentHash",
					"paymentLnBridge.gatewayPaymentId as gatewayPaymentId",
					"paymentLnBridge.expirationIn as expirationIn",
					"accountThunderBridge.gatewayUrl as gatewayUrl",
					"accountThunderBridge.gatewayToken as gatewayToken",
				] as const)
				.where("payment.isDeleted", "is not", sqliteTrue)
				.where("paymentLnBridge.isDeleted", "is not", sqliteTrue)
				.where("paymentWatchingState.isDeleted", "is not", sqliteTrue)
				.where("accountThunderBridge.isDeleted", "is not", sqliteTrue)
				.where("paymentWatchingState.verifiedAt", "is", null)
				.where("paymentWatchingState.stoppedAt", "is", null)
				.where("accountThunderBridge.gatewayUrl", "is not", null),
		);

		const unsubscribeWatchedPayments = subscribeToEvoluQuery(
			props.evolu,
			watchedPaymentsQuery,
			(rows) => {
				const watched = rows as ReadonlyArray<WatchedBridgePayment>;
				const watchedIds = new Set(watched.map((payment) => payment.id));

				for (const [id, controller] of followed) {
					if (!watchedIds.has(id)) {
						controller.abort();
						followed.delete(id);
					}
				}
				for (const payment of watched) {
					if (!followed.has(payment.id)) {
						follow(payment);
					}
				}

				report("info", `Watching ${followed.size} gateway payment(s).`);
			},
		);

		return () => {
			unsubscribeWatchedPayments();
			for (const controller of followed.values()) {
				controller.abort();
			}
			followed.clear();
		};
	},
};
