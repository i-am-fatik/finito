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
	Integer,
	NonEmptyString,
	NonNegativeInteger,
	PositiveNumber,
	Uuid7,
} from "@/lib/shared/types";
import { formatMoney } from "@/lib/shared/utils/format";
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
				.where("posBill.closedAt", "is", null)
				.where("posBill.paymentId", "is", null)
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
			view: {
				paying?: ReadonlyMap<Id, number>;
				settled?: ReadonlyMap<Id, number>;
			} = {},
		): Extract<ScreenData, { variant: "table" }>["payload"] => {
			if (bill === undefined) {
				return {
					bill: null,
				};
			}

			const itemLines = bill.items
				.map((item) => {
					const quantity =
						item.quantity - (view.settled?.get(item.item.id) ?? 0);
					return {
						quantity,
						paying: view.paying?.get(item.item.id) ?? 0,
						optionality: {
							checked: NonNegativeInteger(Math.max(quantity, 0)),
						},
						item: item.item,
					};
				})
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

		const getBillByQrCode = (qrCodeId: NonEmptyString) => {
			const bill = findBillByQrCode(qrCodeId);
			return billScreenOf(bill, {
				paying:
					bill === undefined
						? undefined
						: pending.quantitiesFor(bill.id, Date.now()),
			});
		};

		const closeOutRemoveId = (paymentId: Id, posBillItemId: Id) =>
			createIdFromString(`tableCloseout:${paymentId}:${posBillItemId}`);

		const notifyPaymentFinished = (
			paid: PendingTablePayment,
			billScreenData: Extract<ScreenData, { variant: "table" }>["payload"],
		) => {
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
					const pubkey = input.pubkey ?? subscription?.pubkey;
					const qrCodeId = input.qrCodeId ?? subscription?.qrCodeId;
					if (pubkey === undefined || qrCodeId === undefined) {
						return {
							variant: "info",
							payload: {
								status: "failure",
								text: NonEmptyString("The bill connection expired, reload it."),
							},
						};
					}

					const bill = findBillByQrCode(qrCodeId);
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
					});

					if (created.variant === "info") {
						return created;
					}
					if (bill !== undefined) {
						pending.add(input.payment.paymentId, {
							subscriptionId: input.subscriptionId,
							pubkey,
							qrCodeId,
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

		const settledTableLinesQuery = createQuery((db) =>
			db
				.selectFrom("paymentWatchingState")
				.innerJoin(
					"paymentItemLine",
					"paymentItemLine.paymentId",
					"paymentWatchingState.id",
				)
				.select([
					"paymentWatchingState.id as paymentId",
					"paymentItemLine.posBillId as posBillId",
					"paymentItemLine.posBillItemId as posBillItemId",
					"paymentItemLine.catalogItemId as catalogItemId",
					"paymentItemLine.quantity as quantity",
					"paymentItemLine.totalAmount as totalAmount",
				] as const)
				.where("paymentWatchingState.isDeleted", "is not", sqliteTrue)
				.where("paymentItemLine.isDeleted", "is not", sqliteTrue)
				.where("paymentWatchingState.verifiedAt", "is not", null)
				.where("paymentItemLine.posBillId", "is not", null)
				.where("paymentItemLine.posBillItemId", "is not", null)
				.where("paymentItemLine.quantity", "is not", null)
				.where("paymentItemLine.totalAmount", "is not", null)
				.$narrowType<{
					posBillId: KyselyNotNull;
					posBillItemId: KyselyNotNull;
					quantity: KyselyNotNull;
					totalAmount: KyselyNotNull;
				}>(),
		);

		const closeOutSettledPayments = async (
			rows: ReadonlyArray<typeof settledTableLinesQuery.Row>,
		) => {
			const lines = rows.map((row) => ({
				...row,
				removeId: closeOutRemoveId(row.paymentId, row.posBillItemId),
			}));
			if (lines.length === 0) {
				return;
			}

			const written = await props.evolu.loadQuery(
				createQuery((db) =>
					db
						.selectFrom("posBillItemLine")
						.select(["posBillItemLine.id as id"] as const)
						.where(
							"posBillItemLine.id",
							"in",
							lines.map((line) => line.removeId),
						),
				),
			);
			const alreadyWritten = new Set(written.map((row) => row.id));
			const byPayment = new Map<Id, typeof lines>();
			for (const line of lines) {
				if (alreadyWritten.has(line.removeId)) {
					continue;
				}
				byPayment.set(line.paymentId, [
					...(byPayment.get(line.paymentId) ?? []),
					line,
				]);
			}

			for (const [paymentId, paymentLines] of byPayment) {
				const bill = posBills.find(
					(candidate) => candidate.id === paymentLines[0]?.posBillId,
				);
				const settled = new Map<Id, number>();
				let overpaidAmount = 0;

				for (const line of paymentLines) {
					const onBill = bill?.items.find(
						(item) => item.item.id === line.posBillItemId,
					);
					const removable = Math.min(line.quantity, onBill?.quantity ?? 0);
					if (removable < line.quantity) {
						overpaidAmount += Math.round(
							(line.totalAmount * (line.quantity - removable)) / line.quantity,
						);
					}
					if (removable <= 0 || bill === undefined) {
						continue;
					}
					props.evolu.upsert("posBillItemLine", {
						id: line.removeId,
						posBillId: line.posBillId,
						deviceId,
						catalogItemId: line.catalogItemId,
						itemId: line.posBillItemId,
						_tag: "remove",
						totalAmount: Integer(
							Math.round((line.totalAmount * removable) / line.quantity),
						),
						quantity: PositiveNumber(removable),
					});
					settled.set(line.posBillItemId, removable);
				}

				if (overpaidAmount > 0 && bill !== undefined) {
					props.addNotification({
						id: createIdFromString(`tableOverpaid:${paymentId}`),
						title: props.t(
							"components:notificationItem.backgroundTableProcessing.title",
						),
						type: "warning",
						progress: null,
						canBeClosed: true,
						description: props.t(
							"components:notificationItem.backgroundTableProcessing.overpaid",
							{
								amount: formatMoney({
									value: Integer(overpaidAmount),
									currency: bill.currency,
								}),
							},
						),
						isUnread: true,
						timestamp: Date.now(),
					});
				}

				const paid = pending.settle(paymentId);
				if (paid !== undefined) {
					notifyPaymentFinished(paid, billScreenOf(bill, { settled }));
				}
			}
		};

		const unsubscribeSettled = subscribeToEvoluQuery(
			props.evolu,
			settledTableLinesQuery,
			(rows) => {
				void closeOutSettledPayments(rows).catch((error) => {
					console.error(error);
				});
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
