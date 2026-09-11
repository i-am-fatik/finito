import { type KyselyNotNull, sqliteTrue } from "@evolu/common";
import type { ScreenData } from "@/lib/bill/driver";
import type { TablePaymentRequest } from "@/lib/contracts/table";
import { createQuery } from "@/lib/evolu";
import { PaymentDefaultMethodType } from "@/lib/evolu/model/payment-default-method";
import { createPaymentDefaultMethodsQuery } from "@/lib/evolu/queries/payment-default-method";
import type { Id } from "@/lib/evolu/types";
import type { createPaymentWithDefaultMethods } from "@/lib/payment/service";
import type { EvoluDep } from "@/lib/shared/dependencies";
import {
	Currency,
	Integer,
	NonEmptyString,
	NonNegativeInteger,
	PositiveNumber,
} from "@/lib/shared/types";
import type { PaidLine } from "@/lib/table/pending-table-payments";

export type OpenBill = {
	id: Id;
	currency: Currency;
	table: { label: string } | null;
	items: ReadonlyArray<{
		quantity: number;
		item: { id: Id; label: string; price: number };
	}>;
};

type PaymentScreen = Extract<ScreenData, { variant: "payment" }>["payload"];
type InfoScreen = Extract<ScreenData, { variant: "info" }>["payload"];

export type TablePayment =
	| { variant: "info"; payload: InfoScreen }
	| {
			variant: "payment";
			payload: PaymentScreen;
			lines: ReadonlyArray<PaidLine>;
			expiresAt: number;
	  };

export type TablePaymentDeps = EvoluDep & {
	deviceId: Id | null;
	createPayment: ReturnType<typeof createPaymentWithDefaultMethods>;
	convertToBtc: (
		amount: Integer,
		currency: Currency,
	) => Promise<Integer | null>;
};

type CreateParams = Parameters<TablePaymentDeps["createPayment"]>[0];
type PaymentItems = Extract<CreateParams, { items: unknown[] }>["items"];

const LIGHTNING_TABLES = [
	"paymentLnSpark",
	"paymentLnNwc",
	"paymentLnBridge",
	"paymentLnZap",
] as const;

const refused = (text: string): TablePayment => ({
	variant: "info",
	payload: { status: "failure", text: NonEmptyString(text) },
});

const lightningInvoiceOf = async (evolu: EvoluDep["evolu"], paymentId: Id) => {
	for (const table of LIGHTNING_TABLES) {
		const rows = await evolu.loadQuery(
			createQuery((db) =>
				db
					.selectFrom(table)
					.select(["lnInvoice", "paymentHash", "expirationIn"] as const)
					.where("id", "=", paymentId)
					.where("isDeleted", "is not", sqliteTrue)
					.where("lnInvoice", "is not", null)
					.where("paymentHash", "is not", null)
					.where("expirationIn", "is not", null)
					.$narrowType<{
						lnInvoice: KyselyNotNull;
						paymentHash: KyselyNotNull;
						expirationIn: KyselyNotNull;
					}>(),
			),
		);
		if (rows[0] !== undefined) {
			return rows[0];
		}
	}

	return undefined;
};

const mintedTablePayment = async (
	evolu: EvoluDep["evolu"],
	request: TablePaymentRequest,
): Promise<TablePayment | undefined> => {
	const payments = await evolu.loadQuery(
		createQuery((db) =>
			db
				.selectFrom("payment")
				.select(["totalAmount", "currency"] as const)
				.where("id", "=", request.paymentId)
				.where("isDeleted", "is not", sqliteTrue)
				.where("totalAmount", "is not", null)
				.where("currency", "is not", null)
				.$narrowType<{
					totalAmount: KyselyNotNull;
					currency: KyselyNotNull;
				}>(),
		),
	);
	const payment = payments[0];
	if (payment === undefined) {
		return undefined;
	}

	const invoice = await lightningInvoiceOf(evolu, request.paymentId);
	if (invoice === undefined) {
		return undefined;
	}

	const storedLines = await evolu.loadQuery(
		createQuery((db) =>
			db
				.selectFrom("paymentItemLine")
				.select([
					"posBillItemId",
					"catalogItemId",
					"quantity",
					"totalAmount",
				] as const)
				.where("paymentId", "=", request.paymentId)
				.where("isDeleted", "is not", sqliteTrue)
				.where("posBillItemId", "is not", null)
				.where("quantity", "is not", null)
				.where("totalAmount", "is not", null)
				.$narrowType<{
					posBillItemId: KyselyNotNull;
					quantity: KyselyNotNull;
					totalAmount: KyselyNotNull;
				}>(),
		),
	);

	return {
		variant: "payment",
		payload: {
			payment: {
				id: NonEmptyString(request.paymentId),
				direction: "outgoing",
				totalAmount: payment.totalAmount,
				currency: payment.currency,
				paymentSpecification: {
					type: "lnInvoice",
					lnInvoice: invoice.lnInvoice,
					paymentHash: invoice.paymentHash,
					expirationIn: invoice.expirationIn,
				},
			},
			...(request.merchant === undefined ? {} : { merchant: request.merchant }),
		},
		lines: storedLines.map((line) => ({
			itemId: line.posBillItemId,
			catalogItemId: line.catalogItemId,
			quantity: PositiveNumber(line.quantity),
			totalAmount: Integer(line.totalAmount),
		})),
		expiresAt: invoice.expirationIn * 1000,
	};
};

export const paymentFromSubscribedBill =
	(deps: TablePaymentDeps) =>
	async (params: {
		bill: OpenBill | undefined;
		request: TablePaymentRequest;
	}): Promise<TablePayment> => {
		const { bill, request } = params;
		const minted = await mintedTablePayment(deps.evolu, request);
		if (minted !== undefined) {
			return minted;
		}

		if (bill === undefined) {
			return refused("The bill is no longer open.");
		}
		if (request.paymentOption.type !== "btcLn") {
			return refused("This bill can only be paid over Lightning.");
		}
		if (request.currency !== bill.currency) {
			return refused("The bill changed its currency, reload it.");
		}
		if (request.tip > 0) {
			return refused("This bill takes no tip.");
		}

		const wanted = new Map<
			Id,
			{ onBill: OpenBill["items"][number]; quantity: number }
		>();
		for (const requested of request.items) {
			const onBill = bill.items.find((line) => line.item.id === requested.id);
			if (onBill === undefined) {
				return refused(`${requested.label} is no longer on the bill.`);
			}
			if (onBill.item.price !== requested.price) {
				return refused(
					`${onBill.item.label} has a new price, reload the bill.`,
				);
			}
			wanted.set(onBill.item.id, {
				onBill,
				quantity:
					(wanted.get(onBill.item.id)?.quantity ?? 0) + requested.quantity,
			});
		}
		if (wanted.size === 0) {
			return refused("Nothing is selected.");
		}
		for (const [, { onBill, quantity }] of wanted) {
			if (quantity <= 0 || quantity > onBill.quantity) {
				return refused(
					`Only ${Math.max(onBill.quantity, 0)} of ${onBill.item.label} are on the bill.`,
				);
			}
		}

		const methods = await deps.evolu.loadQuery(
			createPaymentDefaultMethodsQuery({ onlyActive: true }),
		);
		if (
			!methods.some((method) => method.type === PaymentDefaultMethodType.BtcLn)
		) {
			return refused("The merchant takes no Lightning payments right now.");
		}

		const rows = await deps.evolu.loadQuery(
			createQuery((db) =>
				db
					.selectFrom("item")
					.select([
						"item.id as id",
						"item.label as label",
						"item.price as price",
						"item.currency as currency",
						"item.catalogItemId as catalogItemId",
						"item.unitOfMeasure as unitOfMeasure",
						"item.internalCode as internalCode",
						"item.productCodeType as productCodeType",
						"item.productCodeValue as productCodeValue",
						"item.categoryId as categoryId",
					] as const)
					.where("item.isDeleted", "is not", sqliteTrue)
					.where("item.id", "in", [...wanted.keys()])
					.where("item.label", "is not", null)
					.where("item.price", "is not", null)
					.where("item.currency", "is not", null)
					.$narrowType<{
						label: KyselyNotNull;
						price: KyselyNotNull;
						currency: KyselyNotNull;
					}>(),
			),
		);

		const lines: PaidLine[] = [];
		const items: PaymentItems = [];
		for (const [itemId, { onBill, quantity }] of wanted) {
			const row = rows.find((candidate) => candidate.id === itemId);
			if (row === undefined) {
				return refused(`${onBill.item.label} is no longer on the bill.`);
			}
			const totalAmount = Integer(Math.round(row.price * quantity));
			lines.push({
				itemId: row.id,
				catalogItemId: row.catalogItemId,
				quantity: PositiveNumber(quantity),
				totalAmount,
			});
			items.push({
				quantity,
				totalAmount,
				optionalityChecked: null,
				posBill: { billId: bill.id, itemId: row.id },
				item: {
					label: row.label,
					price: row.price,
					currency: row.currency,
					catalogItemId: row.catalogItemId,
					unitOfMeasure: row.unitOfMeasure,
					internalCode: row.internalCode,
					productCodeType: row.productCodeType,
					productCodeValue: row.productCodeValue,
					categoryId: row.categoryId,
				},
			});
		}

		const total = Integer(
			lines.reduce((sum, line) => sum + line.totalAmount, 0),
		);
		const amountInBtc =
			bill.currency === Currency.BTC
				? total
				: await deps.convertToBtc(total, bill.currency);
		if (amountInBtc === null) {
			return refused(
				"The exchange rate is unavailable, try again in a moment.",
			);
		}

		let paymentId: Id;
		try {
			paymentId = await deps.createPayment({
				payment: {
					id: request.paymentId,
					deviceId: deps.deviceId,
					currency: bill.currency,
				},
				items,
				tipAmount: request.tip,
				amountInBtc: NonNegativeInteger(amountInBtc),
			});
		} catch (error) {
			console.error(error);
			return refused(
				"The merchant's wallet did not issue an invoice, try again.",
			);
		}

		const invoice = await lightningInvoiceOf(deps.evolu, paymentId);
		if (invoice === undefined) {
			return refused(
				"The payment carries no Lightning invoice, ask the staff.",
			);
		}

		return {
			variant: "payment",
			payload: {
				payment: {
					id: NonEmptyString(paymentId),
					direction: "outgoing",
					totalAmount: total,
					currency: bill.currency,
					paymentSpecification: {
						type: "lnInvoice",
						lnInvoice: invoice.lnInvoice,
						paymentHash: invoice.paymentHash,
						expirationIn: invoice.expirationIn,
					},
				},
				...(bill.table === null
					? {}
					: { merchant: { name: NonEmptyString(bill.table.label) } }),
			},
			lines,
			expiresAt: invoice.expirationIn * 1000,
		};
	};
