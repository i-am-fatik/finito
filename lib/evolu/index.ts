import {
	AppName,
	createAppOwner,
	createEvolu,
	createIdFromString,
	createQueryBuilder,
	getOrThrow,
	type Mnemonic,
	mnemonicToOwnerSecret,
	type OwnerTransport,
	type Evolu as RawEvolu,
	type EvoluSchema as RawEvoluSchema,
	type StandardSchemaV1,
} from "@evolu/common";
import { createRun } from "@evolu/web";
import { watchEvoluErrors } from "@/lib/diagnostics/collector";
import { createFinitoEvoluDeps } from "@/lib/evolu/deps";
import { TableIdSchema } from "@/lib/evolu/types";
import {
	account,
	accountCashRegister,
	accountIban,
	accountLud16,
	accountNwc,
	accountSpark,
	accountThunderBridge,
} from "@/lib/modules/account/account";
import {
	aiAgent,
	aiAgentScope,
	aiAssistantSettings,
} from "@/lib/modules/ai-assistant/ai-assistant";
import {
	billingInfo,
	billingInfoAddress,
	billingInfoCz,
} from "@/lib/modules/billing-info/billing-info";
import {
	billingSettings,
	invoiceEmailSettings,
	invoiceSettings,
} from "@/lib/modules/billing-settings/billing-settings";
import { category } from "@/lib/modules/catalog-category/catalog-category";
import { catalogItem } from "@/lib/modules/catalog-item/catalog-item";
import { client, clientAddress, clientCz } from "@/lib/modules/client/client";
import {
	contact,
	contactAccount,
	contactAccountIban,
	contactAccountLud16,
	contactAddress,
	contactBillingInfo,
	contactBillingInfoCz,
	contactNostr,
} from "@/lib/modules/contact/contact";
import { device } from "@/lib/modules/device/device";
import { fioPlugin, fioPluginToken } from "@/lib/modules/fio-plugin/fio-plugin";
import {
	invoice,
	invoiceCustomer,
	invoiceCustomerAddress,
	invoiceCustomerBillingInfo,
	invoiceCustomerBillingInfoCz,
	invoiceItemLine,
	invoiceLastNumber,
	invoiceNumberSeries,
	invoiceSupplier,
	invoiceSupplierAddress,
	invoiceSupplierBillingInfo,
	invoiceSupplierBillingInfoCz,
	invoiceWatchingState,
} from "@/lib/modules/invoice/invoice";
import { item } from "@/lib/modules/item/item";
import { menu, menuCategory, menuItemLine } from "@/lib/modules/menu/menu";
import {
	openingHoursExceptionDay,
	openingHoursExceptionSlot,
	openingHoursRegularSlot,
	openingHoursSettings,
} from "@/lib/modules/opening-hours/opening-hours";
import {
	payment,
	paymentBankTransferCZ,
	paymentCash,
	paymentCounterparty,
	paymentItemLine,
	paymentLnBridge,
	paymentLnNwc,
	paymentLnSpark,
	paymentLnZap,
	paymentWatchingState,
	paymentWebData,
} from "@/lib/modules/payment/payment";
import { paymentDefaultMethod } from "@/lib/modules/payment-default-method/payment-default-method";
import {
	paymentReceipt,
	paymentReceiptItemLine,
	paymentReceiptLastNumber,
	paymentReceiptNumberSeries,
	paymentReceiptSupplier,
	paymentReceiptSupplierAddress,
	paymentReceiptSupplierBillingInfo,
	paymentReceiptSupplierBillingInfoCz,
} from "@/lib/modules/payment-receipt/payment-receipt";
import {
	posBill,
	posBillItemLine,
	posBillRate,
} from "@/lib/modules/pos-bill/pos-bill";
import {
	reconciliationClaim,
	reconciliationClaimAllocation,
} from "@/lib/modules/reconciliation-claim/reconciliation-claim";
import {
	reservation,
	reservationBlock,
	reservationBooking,
} from "@/lib/modules/reservation/reservation";
import { NullableTableIdSchema } from "@/lib/modules/shared/schema";
import { smtp } from "@/lib/modules/smtp/smtp";
import { table, tableCode } from "@/lib/modules/table/table";
import { billingSettingsTaxRate } from "@/lib/modules/tax-rate/tax-rate";
import {
	transaction,
	transactionCashRegister,
	transactionIban,
	transactionLud16,
	transactionNwc,
	transactionSpark,
} from "@/lib/modules/transaction/transaction";
import { waiter } from "@/lib/modules/waiter/waiter";

export const AppSchema = {
	category,
	device,
	catalogItem,
	item,
	menu,
	menuCategory,
	menuItemLine,
	table,
	tableCode,
	waiter,
	openingHoursSettings,
	openingHoursRegularSlot,
	openingHoursExceptionDay,
	openingHoursExceptionSlot,
	posBill,
	posBillItemLine,
	posBillRate,
	reservation,
	reservationBooking,
	reservationBlock,
	account,
	accountIban,
	accountLud16,
	accountThunderBridge,
	accountSpark,
	accountNwc,
	accountCashRegister,
	transaction,
	reconciliationClaim,
	reconciliationClaimAllocation,
	transactionIban,
	transactionLud16,
	transactionSpark,
	transactionNwc,
	transactionCashRegister,
	client,
	clientAddress,
	clientCz,
	contact,
	contactAccount,
	contactAccountIban,
	contactAccountLud16,
	contactNostr,
	contactAddress,
	contactBillingInfo,
	contactBillingInfoCz,
	billingInfo,
	billingInfoAddress,
	billingInfoCz,
	fioPlugin,
	fioPluginToken,
	invoiceNumberSeries,
	invoiceLastNumber,
	paymentReceiptNumberSeries,
	paymentReceiptLastNumber,
	smtp,
	aiAssistantSettings,
	aiAgent,
	aiAgentScope,
	billingSettings,
	invoiceSettings,
	invoiceEmailSettings,
	billingSettingsTaxRate,
	paymentDefaultMethod,
	invoice,
	invoiceCustomer,
	invoiceCustomerAddress,
	invoiceCustomerBillingInfo,
	invoiceCustomerBillingInfoCz,
	invoiceSupplier,
	invoiceSupplierAddress,
	invoiceSupplierBillingInfo,
	invoiceSupplierBillingInfoCz,
	invoiceItemLine,
	invoiceWatchingState,
	payment,
	paymentCounterparty,
	paymentWebData,
	paymentItemLine,
	paymentLnZap,
	paymentLnSpark,
	paymentLnNwc,
	paymentLnBridge,
	paymentBankTransferCZ,
	paymentCash,
	paymentWatchingState,
	paymentReceipt,
	paymentReceiptSupplier,
	paymentReceiptSupplierAddress,
	paymentReceiptSupplierBillingInfo,
	paymentReceiptSupplierBillingInfoCz,
	paymentReceiptItemLine,
} satisfies RawEvoluSchema;

export const createQuery = createQueryBuilder(AppSchema);

export const createAppEvolu = async (props: {
	mnemonic: Mnemonic;
	transports: ReadonlyArray<OwnerTransport>;
}) => {
	const deps = createFinitoEvoluDeps();
	watchEvoluErrors(deps.evoluError);
	const run = createRun(deps);
	const evolu = getOrThrow(
		await createEvolu(AppSchema, {
			appName: AppName.orThrow(`Finito${createIdFromString(props.mnemonic)}`),
			// enableLogging: true,
			transports: props.transports,
			appOwner: createAppOwner(mnemonicToOwnerSecret(props.mnemonic)),
			indexes: (create) => {
				const foreignKeyIndexes = (
					Object.entries(AppSchema) as Array<
						[keyof typeof AppSchema, (typeof AppSchema)[keyof typeof AppSchema]]
					>
				).flatMap(([tableName, tableSchema]) =>
					Object.entries(tableSchema)
						.filter(
							([columnName, columnSchema]) =>
								columnName !== "id" &&
								(columnSchema === TableIdSchema ||
									columnSchema === NullableTableIdSchema),
						)
						.map(([columnName]) =>
							create(`${tableName}_${columnName}`)
								.on(tableName as never)
								.column(columnName as never),
						),
				);

				return [
					...foreignKeyIndexes,
					create(`posBillRate_billId_currency`)
						.on(`posBillRate`)
						.column("billId")
						.column("currency"),
					create(`reservation_tag`).on(`reservation`).column("_tag"),
					create(`reservation_startAt`).on(`reservation`).column("startAt"),
					create(`reservation_endAt`).on(`reservation`).column("endAt"),
					create(`reservationBooking_approvalStatus`)
						.on(`reservationBooking`)
						.column("approvalStatus"),
					create(`reservationBooking_serviceStatus`)
						.on(`reservationBooking`)
						.column("serviceStatus"),
					create(`openingHoursRegularSlot_settings_weekday_sortOrder`)
						.on(`openingHoursRegularSlot`)
						.column("openingHoursSettingsId")
						.column("weekday")
						.column("sortOrder"),
					create(`openingHoursExceptionDay_settings_date`)
						.on(`openingHoursExceptionDay`)
						.column("openingHoursSettingsId")
						.column("date"),
					create(`openingHoursExceptionSlot_exceptionDay_sortOrder`)
						.on(`openingHoursExceptionSlot`)
						.column("openingHoursExceptionDayId")
						.column("sortOrder"),
					create(`transaction_tag`).on(`transaction`).column("_tag"),
					create(`transaction_occurredAt`)
						.on(`transaction`)
						.column("occurredAt"),
					create(`transaction_accountId_occurredAt`)
						.on(`transaction`)
						.column("accountId")
						.column("occurredAt"),
					create(`transaction_internalTransferGroupId`)
						.on(`transaction`)
						.column("internalTransferGroupId"),
					create(`reconciliationClaim_sourceType_sourceId`)
						.on(`reconciliationClaim`)
						.column("sourceType")
						.column("sourceId"),
					create(`reconciliationClaim_entityType_entityId`)
						.on(`reconciliationClaim`)
						.column("entityType")
						.column("entityId"),
					create(`reconciliationClaimAllocation_claimId_componentType`)
						.on(`reconciliationClaimAllocation`)
						.column("claimId")
						.column("componentType"),
					create(`paymentLnZap_paymentHash`)
						.on(`paymentLnZap`)
						.column("paymentHash"),
					create(`paymentLnSpark_paymentHash`)
						.on(`paymentLnSpark`)
						.column("paymentHash"),
					create(`paymentLnNwc_paymentHash`)
						.on(`paymentLnNwc`)
						.column("paymentHash"),
					create(`paymentLnBridge_paymentHash`)
						.on(`paymentLnBridge`)
						.column("paymentHash"),
					create(`aiAgent_tokenHash`).on(`aiAgent`).column("tokenHash"),
					// Partial index for actively watched payments (verifiedAt/stoppedAt are null).
					create(`paymentWatchingState_watching_by_timestamps`)
						.on(`paymentWatchingState`)
						.column("verifiedAt")
						.column("stoppedAt")
						.where("verifiedAt", "is", null)
						.where("stoppedAt", "is", null),
				];
			},
		})(run),
	);

	// (async () => {
	// 	console.log("appOwner", await evolu.appOwner, props.mnemonic);
	// })();

	// evolu.resetAppOwner();

	// (async () => {
	// 	const historyQuery = createQuery((db) =>
	// 		db.selectFrom("evolu_history").selectAll().orderBy("timestamp", "desc"),
	// 	);
	//
	// 	const history = await evolu.loadQuery(historyQuery);
	// 	console.log("history", history);
	// })();

	return evolu;
};

export type EvoluSchema = typeof AppSchema;
export type Evolu = RawEvolu<EvoluSchema>;
export type EvoluSchemaType = {
	[key in keyof EvoluSchema]: {
		[key2 in keyof EvoluSchema[key]]: StandardSchemaV1.InferOutput<
			// @ts-expect-error
			EvoluSchema[key][key2]
		>;
	};
};
