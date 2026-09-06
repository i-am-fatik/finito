import {
	evoluJsonArrayFrom,
	evoluJsonObjectFrom,
	type KyselyNotNull,
	sqliteTrue,
} from "@evolu/common";
import { sql } from "kysely";
import { useEvoluQuery } from "@/hooks/use-evolu-query";
import { createQuery, type EvoluSchemaType } from "@/lib/evolu";
import type { Id } from "@/lib/evolu/types";
import type {
	Currency,
	Integer,
	PositiveNumber,
	TimestampMs,
} from "@/lib/shared/types";

export type PosBill = EvoluSchemaType["posBill"] & {
	table: Pick<EvoluSchemaType["table"], "id" | "label"> | null;
	items: (EvoluSchemaType["posBillItemLine"] & {
		item: Omit<EvoluSchemaType["item"], "id">;
	})[];
	rates: EvoluSchemaType["posBillRate"][];
};

export type BillRows = {
	billRows: ReadonlyArray<PosBill>;
};

export type Pos = {
	bills: Record<Id, PosBill>;
};

export type PosClosedBill = {
	id: Id;
	displayId: number;
	label: string | null;
	tableLabel: string | null;
	currency: Currency;
	totalAmount: Integer;
	paymentId: Id | null;
	closedAt: TimestampMs;
};

export const posBillQuery = createQuery<PosBill>((db) =>
	db
		.selectFrom("posBill")
		.select(
			(eb) =>
				[
					"posBill.id as id",
					"posBill.deviceId as deviceId",
					"posBill.displayId as displayId",
					"posBill.label as label",
					"posBill.currency as currency",
					"posBill.tableId as tableId",
					"posBill.paymentId as paymentId",
					"posBill.closedAt as closedAt",

					evoluJsonObjectFrom(
						eb
							.selectFrom("table")
							.select(["table.id as id", "table.label as label"])
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
										"posBillItemLine.id as id",
										"posBillItemLine.posBillId as posBillId",
										"posBillItemLine.deviceId as deviceId",
										"posBillItemLine._tag as _tag",
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
										"posBillItemLine.catalogItemId as catalogItemId",
										"posBillItemLine.itemId as itemId",

										evoluJsonObjectFrom(
											eb
												.selectFrom("item")
												.select([
													"item.label as label",
													"item.price as price",
													"item.currency as currency",
													"item.id as id",
													"item.catalogItemId as catalogItemId",
													"item.unitOfMeasure as unitOfMeasure",
													"item.internalCode as internalCode",
													"item.productCodeType as productCodeType",
													"item.productCodeValue as productCodeValue",
													"item.categoryId as categoryId",
												])
												.whereRef("item.id", "=", "posBillItemLine.itemId")
												.where("item.isDeleted", "is not", sqliteTrue)
												.where("item.label", "is not", null)
												.where("item.price", "is not", null)
												.where("item.currency", "is not", null)
												.$narrowType<{
													label: KyselyNotNull;
													price: KyselyNotNull;
													currency: KyselyNotNull;
												}>(),
										).as("item"),
									] as const,
							)
							.whereRef("posBillItemLine.posBillId", "=", "posBill.id")
							.where("posBillItemLine.isDeleted", "is not", sqliteTrue)
							.where("posBillItemLine.totalAmount", "is not", null)
							.where("posBillItemLine.quantity", "is not", null)
							.where("posBillItemLine._tag", "is not", null)
							.where("posBillItemLine.itemId", "is not", null)
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
								posBillId: KyselyNotNull;
								_tag: KyselyNotNull;
								catalogItemId: KyselyNotNull;
								itemId: KyselyNotNull;
							}>(),
					).as("items"),

					evoluJsonArrayFrom(
						eb
							.selectFrom("posBillRate")
							.select([
								"posBillRate.id as id",
								"posBillRate.billId as billId",
								"posBillRate.currency as currency",
								"posBillRate.rate as rate",
							] as const)
							.whereRef("posBillRate.billId", "=", "posBill.id")
							.where("posBillRate.isDeleted", "is not", sqliteTrue)
							.where("posBillRate.billId", "is not", null)
							.where("posBillRate.currency", "is not", null)
							.where("posBillRate.rate", "is not", null)
							.$narrowType<{
								billId: KyselyNotNull;
								currency: KyselyNotNull;
								rate: KyselyNotNull;
							}>(),
					).as("rates"),
				] as const,
		)
		.where("posBill.isDeleted", "is not", sqliteTrue)
		.where("posBill.closedAt", "is", null)
		.where("posBill.displayId", "is not", null)
		.where("posBill.currency", "is not", null)
		.orderBy("posBill.createdAt", "asc")
		.$narrowType<{
			displayId: KyselyNotNull;
			currency: KyselyNotNull;
		}>(),
);

export const posClosedBillsQuery = createQuery<PosClosedBill>((db) =>
	db
		.selectFrom("posBill")
		.leftJoin("table", "table.id", "posBill.tableId")
		.leftJoin("posBillItemLine", (join) =>
			join
				.onRef("posBillItemLine.posBillId", "=", "posBill.id")
				.on("posBillItemLine.isDeleted", "is not", sqliteTrue),
		)
		.select(
			(eb) =>
				[
					"posBill.id as id",
					"posBill.displayId as displayId",
					"posBill.label as label",
					"table.label as tableLabel",
					"posBill.currency as currency",
					"posBill.paymentId as paymentId",
					"posBill.closedAt as closedAt",
					eb.fn
						.coalesce(
							eb.fn.sum<Integer>(
								eb
									.case()
									.when("posBillItemLine._tag", "=", "add")
									.then(eb.ref("posBillItemLine.totalAmount"))
									.when("posBillItemLine._tag", "=", "remove")
									.then(sql<number>`- ${eb.ref("posBillItemLine.totalAmount")}`)
									.else(0)
									.end(),
							),
							eb.val(0),
						)
						.as("totalAmount"),
				] as const,
		)
		.where("posBill.isDeleted", "is not", sqliteTrue)
		.where("posBill.closedAt", "is not", null)
		.where("posBill.displayId", "is not", null)
		.where("posBill.currency", "is not", null)
		.groupBy("posBill.id")
		.orderBy("posBill.closedAt", "desc")
		.limit(20)
		.$narrowType<{
			displayId: KyselyNotNull;
			currency: KyselyNotNull;
			closedAt: KyselyNotNull;
			totalAmount: KyselyNotNull;
		}>(),
);

export const posBillLastDisplayIdQuery = createQuery((db) =>
	db
		.selectFrom("posBill")
		.select((eb) =>
			eb.fn.max<number | null>("posBill.displayId").as("lastDisplayId"),
		)
		.where("posBill.isDeleted", "is not", sqliteTrue),
);

export const usePosRows = (): BillRows => {
	const { data: billRows } = useEvoluQuery(posBillQuery);

	return {
		billRows,
	};
};

export const usePosClosedBills = (): ReadonlyArray<PosClosedBill> => {
	const { data } = useEvoluQuery(posClosedBillsQuery);

	return data;
};

export const usePos = (): Pos => {
	const { billRows } = usePosRows();

	return {
		bills: Object.fromEntries(billRows.map((bill) => [bill.id, bill])),
	};
};
