import {
	createIdFromString,
	evoluJsonArrayFrom,
	evoluJsonObjectFrom,
	type KyselyNotNull,
	sqliteTrue,
} from "@evolu/common";
import { sql } from "kysely";
import type { BackgroundProcess } from "@/lib/background/service";
import type { ScreenData } from "@/lib/bill/driver";
import { createQuery } from "@/lib/evolu";
import { createDeviceQuery } from "@/lib/evolu/device";
import type { Id } from "@/lib/evolu/types";
import { subscribeToEvoluQuery } from "@/lib/evolu/utils";
import { currencyConverter } from "@/lib/integrations/currency-converter/currency-converter";
import { createPaymentWithDefaultMethods } from "@/lib/payment/service";
import {
	Currency,
	NonEmptyString,
	NonNegativeInteger,
	type PositiveNumber,
	TimestampMs,
	Uuid7,
} from "@/lib/shared/types";
import {
	tableEventMessageBus,
	tableRequestMessageBus,
} from "@/lib/table/message-bus";
import {
	type PendingTablePayment,
	pendingTablePayments,
} from "@/lib/table/pending-table-payments";
import { paymentFromSubscribedBill } from "@/lib/table/subscribed-bill-payment";

const notificationId = createIdFromString("backgroundTableProcessing");
const subscriptionTimeoutMs = 30_000;

export const backgroundTableProcessingProcess: BackgroundProcess = {
	name: "backgroundTableProcessing",
	run: async (props) => {
		props.addNotification({
			title: props.t(
				"components:notificationItem.backgroundTableProcessing.title",
			),
			type: "info",
			progress: null,
			canBeClosed: false,
			description: props.t(
				"components:notificationItem.backgroundTableProcessing.description",
			),
			isUnread: false,
			id: notificationId,
			timestamp: Date.now(),
		});

		const subscriptionRef = new Map<
			Uuid7,
			{
				pubkey: string;
				qrCodeId: NonEmptyString;
				timeout: ReturnType<typeof setTimeout>;
			}
		>();
		const startedAt = TimestampMs(Date.now());
		const pending = pendingTablePayments();
		const devices = await props.deviceEvolu.loadQuery(
			createDeviceQuery((db) =>
				db
					.selectFrom("device")
					.select(["device.id as id"] as const)
					.where("device.isDeleted", "is not", sqliteTrue),
			),
		);
		const deviceId = devices[0]?.id ?? null;

		const posBillsQuery = createQuery((db) =>
			db
				.selectFrom("posBill")
				.select(
					(eb) =>
						[
							"posBill.id as id",
							"posBill.tableId as tableId",
							"posBill.currency as currency",

							evoluJsonObjectFrom(
								eb
									.selectFrom("table")
									.select((eb) => [
										"table.label as label",

										evoluJsonArrayFrom(
											eb
												.selectFrom("tableCode")
												.select(["tableCode.code as code"] as const)
												.whereRef("tableCode.tableId", "=", "table.id")
												.where("tableCode.isDeleted", "is not", sqliteTrue)
												.where("tableCode.code", "is not", null)
												.$narrowType<{
													code: KyselyNotNull;
												}>(),
										).as("codes"),
									])
									.whereRef("posBill.tableId", "=", "table.id")
									.where("table.isDeleted", "is not", sqliteTrue)
									.where("table.label", "is not", null)
									.$narrowType<{
										label: KyselyNotNull;
									}>(),
							).as("table"),

							evoluJsonArrayFrom(
								eb
									.selectFrom("posBillItemLine")
									.select(
										(eb) =>
											[
												"posBillItemLine.totalAmount as totalAmount",
												eb.fn
													.sum<PositiveNumber>(
														eb
															.case()
															.when("posBillItemLine._tag", "=", "add")
															.then(eb.ref("posBillItemLine.quantity"))
															.when("posBillItemLine._tag", "=", "remove")
															.then(
																sql<number>`- ${eb.ref("posBillItemLine.quantity")}`,
															)
															.else(0)
															.end(),
													)
													.as("quantity"),

												evoluJsonObjectFrom(
													eb
														.selectFrom("item")
														.select([
															"item.label as label",
															"item.price as price",
															"item.id as id",
														])
														.whereRef("item.id", "=", "posBillItemLine.itemId")
														.where("item.isDeleted", "is not", sqliteTrue)
														.where("item.label", "is not", null)
														.where("item.price", "is not", null)
														.$narrowType<{
															label: KyselyNotNull;
															price: KyselyNotNull;
														}>(),
												).as("item"),
											] as const,
									)
									.whereRef("posBillItemLine.posBillId", "=", "posBill.id")
									.where("posBillItemLine.isDeleted", "is not", sqliteTrue)
									.where("posBillItemLine.totalAmount", "is not", null)
									.where("posBillItemLine.quantity", "is not", null)
									.having(
										(eb) =>
											eb.fn.sum<PositiveNumber>(
												eb
													.case()
													.when("posBillItemLine._tag", "=", "add")
													.then(eb.ref("posBillItemLine.quantity"))
													.when("posBillItemLine._tag", "=", "remove")
													.then(
														sql<number>`- ${eb.ref("posBillItemLine.quantity")}`,
													)
													.else(0)
													.end(),
											),
										">",
										0 as PositiveNumber,
									)
									.groupBy("posBillItemLine.itemId")
									.$narrowType<{
										totalAmount: KyselyNotNull;
										quantity: KyselyNotNull;
										item: KyselyNotNull;
									}>(),
							).as("items"),
						] as const,
				)
				.where("posBill.isDeleted", "is not", sqliteTrue)
				.where("posBill.currency", "is not", null)
				.$narrowType<{
					currency: KyselyNotNull;
				}>(),
		);

		let posBills: (typeof posBillsQuery.Row)[] = [];

		const findBillByQrCode = (qrCodeId: NonEmptyString) =>
			posBills.find(
				(item) =>
					item.table &&
					item.table.codes.find((code) => code.code === qrCodeId) !== undefined,
			);

		const billScreenOf = (
			bill: typeof posBillsQuery.Row | undefined,
			paid: ReadonlyMap<Id, number> = new Map(),
		): Extract<ScreenData, { variant: "table" }>["payload"] => {
			if (bill === undefined) {
				return {
					bill: null,
				};
			}

			const itemLines = bill.items
				.map((item) => ({
					quantity: item.quantity - (paid.get(item.item.id) ?? 0),
					optionality: {
						checked: NonNegativeInteger(0),
					},
					item: item.item,
				}))
				.filter((line) => line.quantity > 0);

			return {
				bill: {
					currency: bill.currency,
					itemLines,
				},
				merchant: {
					name: bill.table?.label ?? NonEmptyString("Unknown"),
				},
			};
		};

		const getBillByQrCode = (qrCodeId: NonEmptyString) =>
			billScreenOf(findBillByQrCode(qrCodeId));

		const closeOutPaidLines = (paid: PendingTablePayment) => {
			const bill = posBills.find((item) => item.id === paid.billId);
			const billScreenData = billScreenOf(
				bill,
				new Map(paid.lines.map((line) => [line.itemId, line.quantity])),
			);
			if (bill !== undefined) {
				for (const line of paid.lines) {
					props.evolu.insert("posBillItemLine", {
						posBillId: bill.id,
						deviceId,
						catalogItemId: line.catalogItemId,
						itemId: line.itemId,
						_tag: "remove",
						totalAmount: line.totalAmount,
						quantity: line.quantity,
					});
				}
			}

			tableEventMessageBus
				.createInstance({
					ndk: props.ndk,
				})
				.getClient({
					recipientPubkey: paid.pubkey,
				})
				.call(
					"paymentFinished",
					{
						billScreenData,
						subscriptionId: paid.subscriptionId,
					},
					{
						ignoreResponse: true,
					},
				)
				.then((result) => {
					if (!result.ok) {
						console.error(result.error);
					}
				});
		};

		const sendBillChange = (input: {
			pubkey: string;
			qrCodeId: NonEmptyString;
			subscriptionId: Uuid7;
		}) => {
			tableEventMessageBus
				.createInstance({
					ndk: props.ndk,
				})
				.getClient({
					recipientPubkey: input.pubkey,
				})
				.call(
					"billChange",
					{
						billScreenData: getBillByQrCode(input.qrCodeId),
						subscriptionId: input.subscriptionId,
					},
					{
						ignoreResponse: true,
					},
				)
				.then((result) => {
					if (!result.ok) {
						console.error(result.error);
					}
				});
		};

		const sendBillChangeToAll = () => {
			for (const [subscriptionId, subscription] of subscriptionRef.entries()) {
				sendBillChange({
					pubkey: subscription.pubkey,
					qrCodeId: subscription.qrCodeId,
					subscriptionId,
				});
			}
		};

		const serverPromise = tableRequestMessageBus
			.createInstance({
				ndk: props.ndk,
			})
			.listen({
				createPaymentFromSubscribedBill: async (input) => {
					const subscription = subscriptionRef.get(input.subscriptionId);
					if (subscription === undefined) {
						return {
							variant: "info",
							payload: {
								status: "failure",
								text: NonEmptyString("Unexpected subscription"),
							},
						};
					}

					const bill = findBillByQrCode(subscription.qrCodeId);
					const created = await paymentFromSubscribedBill({
						evolu: props.evolu,
						deviceId,
						createPayment: createPaymentWithDefaultMethods({
							evolu: props.evolu,
							ndk: props.ndk,
						}),
						convertToBtc: (amount, currency) =>
							currencyConverter.convert({
								amount,
								sourceCurrency: currency,
								targetCurrency: Currency.BTC,
							}),
					})({
						bill,
						request: input.payment,
						pendingQuantities:
							bill === undefined
								? new Map()
								: pending.quantitiesFor(bill.id, Date.now()),
					});

					if (created.variant === "info") {
						return created;
					}
					if (bill !== undefined) {
						pending.add(input.payment.paymentId, {
							subscriptionId: input.subscriptionId,
							pubkey: subscription.pubkey,
							qrCodeId: subscription.qrCodeId,
							billId: bill.id,
							lines: created.lines,
							expiresAt: created.expiresAt,
						});
					}

					return { variant: "payment", payload: created.payload };
				},
				subscribeToBillByQrCode: async (input) => {
					const subscriptionId = input.subscriptionId ?? Uuid7.random();
					const subscription = subscriptionRef.get(subscriptionId);
					if (subscription !== undefined) {
						clearTimeout(subscription.timeout);
						subscription.timeout = setTimeout(() => {
							subscriptionRef.delete(subscriptionId);
						}, subscriptionTimeoutMs);

						sendBillChange({
							pubkey: subscription.pubkey,
							qrCodeId: subscription.qrCodeId,
							subscriptionId,
						});

						return {
							subscriptionId,
						};
					}

					subscriptionRef.set(subscriptionId, {
						pubkey: input.pubkey,
						qrCodeId: input.qrCodeId,
						timeout: setTimeout(() => {
							subscriptionRef.delete(subscriptionId);
						}, subscriptionTimeoutMs),
					});

					sendBillChange({
						...input,
						subscriptionId,
					});

					return {
						subscriptionId,
					};
				},
				unsubscribe: async (input) => {
					const subscription = subscriptionRef.get(input.subscriptionId);
					if (subscription) {
						clearTimeout(subscription.timeout);
					}
					subscriptionRef.delete(input.subscriptionId);
					return null;
				},
			});

		const unsubscribePosBills = subscribeToEvoluQuery(
			props.evolu,
			posBillsQuery,
			(data) => {
				posBills = [...data];
				sendBillChangeToAll();
			},
		);

		const settledSinceStartQuery = createQuery((db) =>
			db
				.selectFrom("paymentWatchingState")
				.select(["paymentWatchingState.id as id"] as const)
				.where("paymentWatchingState.isDeleted", "is not", sqliteTrue)
				.where("paymentWatchingState.verifiedAt", ">=", startedAt),
		);

		const unsubscribeSettled = subscribeToEvoluQuery(
			props.evolu,
			settledSinceStartQuery,
			(rows) => {
				for (const row of rows) {
					const paid = pending.settle(row.id);
					if (paid !== undefined) {
						closeOutPaidLines(paid);
					}
				}
			},
		);

		return () => {
			unsubscribePosBills();
			unsubscribeSettled();
			for (const subscription of subscriptionRef.values()) {
				clearTimeout(subscription.timeout);
			}
			void serverPromise.then((server) => {
				if (!server.ok) {
					console.error(server.error);
					return;
				}
				server.value.close();
			});
		};
	},
};
