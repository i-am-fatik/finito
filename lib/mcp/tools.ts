import {
	createId,
	createIdFromString,
	createRandomBytes,
	type Id,
	type KyselyNotNull,
	sqliteTrue,
} from "@evolu/common";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
	type PosBill,
	posBillLastDisplayIdQuery,
	posBillQuery,
} from "@/hooks/use-pos";
import { createItemToolInputSchema } from "@/lib/ai/item-assistant";
import type { DiagnosticEvent } from "@/lib/diagnostics/collector";
import { createQuery } from "@/lib/evolu";
import { AiAgentScope } from "@/lib/evolu/model/ai-agent";
import { getAllCatalogItemsQuery } from "@/lib/evolu/queries/catalog-item";
import { activeCategoriesQuery } from "@/lib/evolu/queries/category";
import { createGetContactsQuery } from "@/lib/evolu/queries/contact";
import { getLatestPayments } from "@/lib/evolu/queries/payment";
import type { AppLanguage } from "@/lib/i18n/config";
import { SUPPORTED_LANGUAGES } from "@/lib/i18n/config";
import {
	createCatalogItem,
	createItemFromCatalogItem,
} from "@/lib/item/service";
import { createPaymentWithDefaultMethods } from "@/lib/payment/service";
import type { EvoluDep, NdkDep } from "@/lib/shared/dependencies";
import {
	Currency,
	Integer,
	NonEmptyString,
	NonEmptyString255,
	NonNegativeInteger,
	PositiveInteger,
	PositiveNumber,
} from "@/lib/shared/types";
import {
	convertMinorUnitsWithRate,
	decimalStringToMinorUnitsForUI,
	minorUnitsToDecimalStringForUI,
} from "@/lib/shared/zod/money-codec";

export type AgentToolDeps = EvoluDep &
	NdkDep & {
		deviceId: Id;
		setLanguage: (language: AppLanguage) => Promise<void>;
		readDiagnostics: () => ReadonlyArray<DiagnosticEvent>;
	};

const settingsId = createIdFromString("");

const defaultCurrencyQuery = createQuery((db) =>
	db
		.selectFrom("billingSettings")
		.select(["billingSettings.defaultCurrency as defaultCurrency"])
		.where("billingSettings.isDeleted", "is not", sqliteTrue)
		.where("billingSettings.id", "=", settingsId)
		.where("billingSettings.defaultCurrency", "is not", null)
		.$narrowType<{ defaultCurrency: KyselyNotNull }>(),
);

const tablesQuery = createQuery((db) =>
	db
		.selectFrom("table")
		.select([
			"table.id as id",
			"table.label as label",
			"table.numberOfSeats as numberOfSeats",
		])
		.where("table.isDeleted", "is not", sqliteTrue)
		.where("table.label", "is not", null)
		.orderBy("table.label", "asc")
		.$narrowType<{ label: KyselyNotNull }>(),
);

const tableCodesQuery = createQuery((db) =>
	db
		.selectFrom("tableCode")
		.select([
			"tableCode.id as id",
			"tableCode.tableId as tableId",
			"tableCode.code as code",
		])
		.where("tableCode.isDeleted", "is not", sqliteTrue)
		.where("tableCode.code", "is not", null)
		.where("tableCode.tableId", "is not", null)
		.$narrowType<{ code: KyselyNotNull; tableId: KyselyNotNull }>(),
);

const lnInvoiceTables = [
	"paymentLnZap",
	"paymentLnSpark",
	"paymentLnNwc",
	"paymentLnBridge",
] as const;

const createLnInvoiceQuery = (
	table: (typeof lnInvoiceTables)[number],
	paymentId: Id,
) =>
	createQuery((db) =>
		db
			.selectFrom(table)
			.select(["lnInvoice"])
			.where("id", "=", paymentId)
			.where("isDeleted", "is not", sqliteTrue)
			.where("lnInvoice", "is not", null)
			.$narrowType<{ lnInvoice: KyselyNotNull }>(),
	);

const text = (payload: unknown): CallToolResult => ({
	content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
});

const refuse = (message: string): CallToolResult => ({
	content: [{ type: "text", text: message }],
	isError: true,
});

const guard = (run: () => Promise<CallToolResult>) =>
	run().catch((error: unknown) =>
		refuse(error instanceof Error ? error.message : "The action failed."),
	);

const decimal = (value: number, currency: Currency) =>
	minorUnitsToDecimalStringForUI({ value: Integer(value), currency });

const readOnly = { readOnlyHint: true } as const;

const loadDefaultCurrency = async (deps: AgentToolDeps) =>
	(await deps.evolu.loadQuery(defaultCurrencyQuery))[0]?.defaultCurrency ??
	null;

const parseAmount = (params: { amount: string; currency: Currency }) => {
	const minorUnits = decimalStringToMinorUnitsForUI({
		value: params.amount.replace(",", "."),
		currency: params.currency,
	});

	return minorUnits === null || minorUnits <= 0 ? null : minorUnits;
};

const subtotalPerCurrency = (bill: PosBill) => {
	const totals = new Map<Currency, Integer>();
	for (const line of bill.items) {
		totals.set(
			line.item.currency,
			Integer(
				(totals.get(line.item.currency) ?? 0) +
					Math.round(line.item.price * line.quantity),
			),
		);
	}

	return totals;
};

const billTotal = (bill: PosBill) => {
	let total = 0;
	for (const [currency, value] of subtotalPerCurrency(bill)) {
		if (currency === bill.currency) {
			total += value;
			continue;
		}

		const rate = bill.rates.find((item) => item.currency === currency)?.rate;
		if (rate === undefined) {
			return null;
		}

		total += convertMinorUnitsWithRate({
			value,
			sourceCurrency: currency,
			targetCurrency: bill.currency,
			rate,
		});
	}

	return Integer(total);
};

const describeBill = (bill: PosBill) => ({
	id: bill.id,
	displayId: bill.displayId,
	label: bill.label,
	tableId: bill.tableId,
	table: bill.table?.label ?? null,
	currency: bill.currency,
	isBeingPaid: bill.paymentId !== null,
	items: bill.items.map((line) => ({
		itemId: line.itemId,
		catalogItemId: line.catalogItemId,
		label: line.item.label,
		quantity: line.quantity,
		currency: line.item.currency,
		unitPrice: decimal(line.item.price, line.item.currency),
		lineTotal: decimal(
			Math.round(line.item.price * line.quantity),
			line.item.currency,
		),
	})),
	subtotals: [...subtotalPerCurrency(bill)].map(([currency, value]) => ({
		currency,
		amount: decimal(value, currency),
	})),
	total: (() => {
		const total = billTotal(bill);
		return total === null ? null : decimal(total, bill.currency);
	})(),
});

const registerCatalogReadTools = (server: McpServer, deps: AgentToolDeps) => {
	server.registerTool(
		"catalog_list_items",
		{
			title: "List catalog items",
			description:
				"Lists the sales items in the catalog with their price in the display units of their currency, sats for BTC, and their category.",
			annotations: readOnly,
		},
		() =>
			guard(async () => {
				const [items, categories] = await Promise.all([
					deps.evolu.loadQuery(getAllCatalogItemsQuery),
					deps.evolu.loadQuery(activeCategoriesQuery),
				]);
				const categoryNames = new Map(
					categories.map((category) => [category.id, category.name]),
				);

				return text(
					items.map((item) => ({
						id: item.id,
						label: item.label,
						price: decimal(item.price, item.currency),
						currency: item.currency,
						unitOfMeasure: item.unitOfMeasure,
						category:
							item.categoryId === null
								? null
								: (categoryNames.get(item.categoryId) ?? null),
					})),
				);
			}),
	);
};

const registerCatalogWriteTools = (server: McpServer, deps: AgentToolDeps) => {
	server.registerTool(
		"catalog_create_item",
		{
			title: "Create a catalog item",
			description:
				"Creates a new sales item in the catalog. The price is a decimal string in the display units of the currency, for example 49.90 for CZK or 1500 for BTC, which is sats.",
			inputSchema: createItemToolInputSchema.shape,
		},
		({ label, price, currency, unitOfMeasure }) =>
			guard(async () => {
				const itemCurrency = currency ?? (await loadDefaultCurrency(deps));
				if (itemCurrency === null) {
					return refuse(
						"No currency was given and no default currency is configured.",
					);
				}
				const minorUnits = parseAmount({
					amount: price,
					currency: itemCurrency,
				});
				if (minorUnits === null) {
					return refuse(
						`"${price}" is not a valid price, use a positive decimal number such as 49.90.`,
					);
				}
				const unit = unitOfMeasure?.trim() ?? "";

				const catalogItem = createCatalogItem(deps)({
					catalogItem: {
						deviceId: deps.deviceId,
						label: NonEmptyString255(label.trim()),
						price: minorUnits,
						costPrice: null,
						currency: itemCurrency,
						unitOfMeasure: unit === "" ? null : NonEmptyString(unit),
						internalCode: null,
						productCodeType: null,
						productCodeValue: null,
						categoryId: null,
					},
				});

				return text({
					id: catalogItem.id,
					label: catalogItem.label,
					price: decimal(catalogItem.price, catalogItem.currency),
					currency: catalogItem.currency,
				});
			}),
	);
	server.registerTool(
		"catalog_update_item",
		{
			title: "Update a catalog item",
			description:
				"Changes the label, price or unit of an existing catalog item. The price stays in the currency the item was created with. Omitted fields keep their current value.",
			inputSchema: {
				itemId: z
					.string()
					.describe("Id of a catalog item from catalog_list_items."),
				label: z
					.string()
					.trim()
					.min(1)
					.max(255)
					.optional()
					.describe("New display name."),
				price: z
					.string()
					.min(1)
					.optional()
					.describe(
						"New price as a decimal string in the display units of the item currency, sats for BTC. Example: 49.90",
					),
				unitOfMeasure: z
					.string()
					.max(64)
					.nullable()
					.optional()
					.describe("New unit of measure, or null to clear it."),
			},
		},
		({ itemId, label, price, unitOfMeasure }) =>
			guard(async () => {
				const catalogItems = await deps.evolu.loadQuery(
					getAllCatalogItemsQuery,
				);
				const catalogItem = catalogItems.find(
					(candidate) => candidate.id === itemId,
				);
				if (catalogItem === undefined) {
					return refuse(`Catalog item ${itemId} does not exist.`);
				}

				const minorUnits =
					price === undefined
						? catalogItem.price
						: parseAmount({ amount: price, currency: catalogItem.currency });
				if (minorUnits === null) {
					return refuse(
						`"${price}" is not a valid price, use a positive decimal number such as 49.90.`,
					);
				}

				const unit = unitOfMeasure?.trim();
				deps.evolu.update("catalogItem", {
					id: catalogItem.id,
					...(label === undefined ? {} : { label: NonEmptyString255(label) }),
					price: Integer(minorUnits),
					...(unitOfMeasure === undefined
						? {}
						: {
								unitOfMeasure:
									unit === undefined || unit === ""
										? null
										: NonEmptyString(unit),
							}),
				});

				return text({
					id: catalogItem.id,
					label: label ?? catalogItem.label,
					price: decimal(minorUnits, catalogItem.currency),
					currency: catalogItem.currency,
				});
			}),
	);
};

const registerPosReadTools = (server: McpServer, deps: AgentToolDeps) => {
	server.registerTool(
		"pos_list_tables",
		{
			title: "List tables",
			description: "Lists the tables of the venue with their number of seats.",
			annotations: readOnly,
		},
		() =>
			guard(async () => {
				const [tables, codes] = await Promise.all([
					deps.evolu.loadQuery(tablesQuery),
					deps.evolu.loadQuery(tableCodesQuery),
				]);

				return text(
					tables.map((table) => ({
						id: table.id,
						label: table.label,
						seats: table.numberOfSeats,
						codes: codes
							.filter((code) => code.tableId === table.id)
							.map((code) => code.code),
					})),
				);
			}),
	);
	server.registerTool(
		"pos_list_open_bills",
		{
			title: "List open bills",
			description:
				"Lists the open POS bills with their table and items. Every amount is in the display units of the currency named next to it, sats for BTC. Subtotals are given per currency, and total is the sum in the bill currency, or null when the bill holds an item in a currency it has no exchange rate for.",
			annotations: readOnly,
		},
		() =>
			guard(async () =>
				text((await deps.evolu.loadQuery(posBillQuery)).map(describeBill)),
			),
	);
};

const registerPosWriteTools = (server: McpServer, deps: AgentToolDeps) => {
	server.registerTool(
		"pos_create_table",
		{
			title: "Create a table",
			description:
				"Creates a table in the venue and returns its id for pos_open_bill.",
			inputSchema: {
				label: z
					.string()
					.trim()
					.min(1)
					.max(255)
					.describe("Display name of the table. Example: Stůl 1"),
				numberOfSeats: z
					.number()
					.int()
					.positive()
					.describe("How many guests the table seats."),
			},
		},
		({ label, numberOfSeats }) =>
			guard(async () => {
				const tables = await deps.evolu.loadQuery(tablesQuery);
				const taken = tables.find((table) => table.label === label);
				if (taken !== undefined) {
					return refuse(`A table named "${label}" already exists.`);
				}

				const { id } = deps.evolu.insert("table", {
					deviceId: deps.deviceId,
					label: NonEmptyString255(label),
					numberOfSeats: PositiveInteger(numberOfSeats),
				});

				return text({ id, label, seats: numberOfSeats });
			}),
	);
	server.registerTool(
		"pos_set_table_code",
		{
			title: "Set the code of a table",
			description:
				"Gives a table the code its QR code encodes, so a guest can open the table bill in their own app. Replaces any code the table already has. Omit the code to have one generated.",
			inputSchema: {
				tableId: z.string().describe("Id of a table from pos_list_tables."),
				code: z
					.string()
					.trim()
					.min(1)
					.max(255)
					.optional()
					.describe(
						"The code to use. Generated when omitted. It has to be unique across tables.",
					),
			},
		},
		({ tableId, code }) =>
			guard(async () => {
				const [tables, codes] = await Promise.all([
					deps.evolu.loadQuery(tablesQuery),
					deps.evolu.loadQuery(tableCodesQuery),
				]);
				const table = tables.find((candidate) => candidate.id === tableId);
				if (table === undefined) {
					return refuse(`Table ${tableId} does not exist.`);
				}

				const tableCode =
					code ?? createId({ randomBytes: createRandomBytes() });
				const taken = codes.find(
					(candidate) =>
						candidate.code === tableCode && candidate.tableId !== table.id,
				);
				if (taken !== undefined) {
					return refuse(`The code "${tableCode}" belongs to another table.`);
				}

				for (const replaced of codes.filter(
					(candidate) => candidate.tableId === table.id,
				)) {
					deps.evolu.update("tableCode", {
						id: replaced.id,
						isDeleted: sqliteTrue,
					});
				}
				deps.evolu.insert("tableCode", {
					tableId: table.id,
					code: NonEmptyString255(tableCode),
				});

				return text({ tableId: table.id, label: table.label, code: tableCode });
			}),
	);
	server.registerTool(
		"pos_open_bill",
		{
			title: "Open a bill",
			description:
				"Opens a new empty POS bill, optionally on a table, and returns its id for pos_add_item_to_bill.",
			inputSchema: {
				tableId: z
					.string()
					.nullable()
					.optional()
					.describe(
						"Id of a table from pos_list_tables, or null for a bill without a table.",
					),
				label: z
					.string()
					.trim()
					.max(255)
					.nullable()
					.optional()
					.describe("Optional bill name shown in the POS."),
				currency: z
					.enum(Currency)
					.nullable()
					.optional()
					.describe(
						"Bill currency, defaults to the configured default currency.",
					),
			},
		},
		({ tableId, label, currency }) =>
			guard(async () => {
				const billCurrency = currency ?? (await loadDefaultCurrency(deps));
				if (billCurrency === null) {
					return refuse(
						"No currency was given and no default currency is configured.",
					);
				}
				if (tableId) {
					const tables = await deps.evolu.loadQuery(tablesQuery);
					if (!tables.some((table) => table.id === tableId)) {
						return refuse(`Table ${tableId} does not exist.`);
					}
				}
				const [lastBill] = await deps.evolu.loadQuery(
					posBillLastDisplayIdQuery,
				);
				const displayId = PositiveInteger((lastBill?.lastDisplayId ?? 0) + 1);

				const { id } = deps.evolu.insert("posBill", {
					deviceId: deps.deviceId,
					displayId,
					label: label ? NonEmptyString255(label) : null,
					currency: billCurrency,
					tableId: (tableId ?? null) as Id | null,
				});

				return text({ id, displayId, currency: billCurrency });
			}),
	);
	server.registerTool(
		"pos_add_item_to_bill",
		{
			title: "Add a catalog item to a bill",
			description:
				"Adds a quantity of a catalog item to an open bill at the catalog price. The item and the bill must share a currency.",
			inputSchema: {
				billId: z
					.string()
					.describe(
						"Id of an open bill from pos_list_open_bills or pos_open_bill.",
					),
				catalogItemId: z
					.string()
					.describe("Id of a catalog item from catalog_list_items."),
				quantity: z
					.number()
					.positive()
					.describe("Quantity to add, for example 2 or 0.5."),
			},
		},
		({ billId, catalogItemId, quantity }) =>
			guard(async () => {
				const [bills, catalogItems] = await Promise.all([
					deps.evolu.loadQuery(posBillQuery),
					deps.evolu.loadQuery(getAllCatalogItemsQuery),
				]);
				const bill = bills.find((candidate) => candidate.id === billId);
				if (bill === undefined) {
					return refuse(`Bill ${billId} is not open.`);
				}
				if (bill.paymentId !== null) {
					return refuse(`Bill ${billId} is being paid at the till.`);
				}
				const catalogItem = catalogItems.find(
					(candidate) => candidate.id === catalogItemId,
				);
				if (catalogItem === undefined) {
					return refuse(`Catalog item ${catalogItemId} does not exist.`);
				}
				if (catalogItem.currency !== bill.currency) {
					return refuse(
						`The item is priced in ${catalogItem.currency} but the bill is in ${bill.currency}.`,
					);
				}

				const item = await createItemFromCatalogItem(deps)({ catalogItem });
				const totalAmount = Integer(Math.round(catalogItem.price * quantity));
				deps.evolu.insert("posBillItemLine", {
					posBillId: bill.id,
					deviceId: deps.deviceId,
					catalogItemId: catalogItem.id,
					itemId: item.id,
					_tag: "add",
					totalAmount,
					quantity: PositiveNumber(quantity),
				});

				return text({
					billId: bill.id,
					itemId: item.id,
					label: item.label,
					quantity,
					lineTotal: decimal(totalAmount, bill.currency),
				});
			}),
	);
};

const registerPaymentsReadTools = (server: McpServer, deps: AgentToolDeps) => {
	server.registerTool(
		"payments_list_latest",
		{
			title: "List latest payments",
			description:
				"Lists the 20 latest payments with amount, direction, counterparty and the amount already matched by settled transactions.",
			annotations: readOnly,
		},
		() =>
			guard(async () =>
				text(
					(await deps.evolu.loadQuery(getLatestPayments)).map((payment) => ({
						id: payment.id,
						createdAt: payment.createdAt,
						direction: payment.direction,
						currency: payment.currency,
						totalAmount: decimal(payment.totalAmount, payment.currency),
						tipAmount:
							payment.tipAmount === null
								? null
								: decimal(payment.tipAmount, payment.currency),
						counterparty:
							payment.counterparty?.name ?? payment.counterparty?.label ?? null,
						settledAmount: decimal(
							payment.reconciliationClaim.amount ?? 0,
							payment.currency,
						),
					})),
				),
			),
	);
};

const registerPaymentsWriteTools = (server: McpServer, deps: AgentToolDeps) => {
	server.registerTool(
		"payments_create",
		{
			title: "Create a payment request",
			description:
				"Creates an incoming payment request with the configured default payment methods and returns its id and, when a Lightning method is active, the BOLT11 invoice. Lightning methods need the amount in sats.",
			inputSchema: {
				amount: z
					.string()
					.trim()
					.min(1)
					.describe(
						"Amount as a decimal string in the display units of the currency, for example 250 or 49.90 for fiat and 1500 for BTC, which is sats.",
					),
				currency: z
					.enum(Currency)
					.nullable()
					.optional()
					.describe(
						"Payment currency, defaults to the configured default currency.",
					),
				amountInSats: z
					.number()
					.int()
					.nonnegative()
					.nullable()
					.optional()
					.describe(
						"The same amount converted to satoshis, required when a Lightning payment method is active.",
					),
			},
		},
		({ amount, currency, amountInSats }) =>
			guard(async () => {
				const paymentCurrency = currency ?? (await loadDefaultCurrency(deps));
				if (paymentCurrency === null) {
					return refuse(
						"No currency was given and no default currency is configured.",
					);
				}
				const totalAmount = parseAmount({ amount, currency: paymentCurrency });
				if (totalAmount === null) {
					return refuse(
						`"${amount}" is not a valid amount, use a positive decimal number such as 250 or 49.90.`,
					);
				}

				const id = createId({ randomBytes: createRandomBytes() });
				await createPaymentWithDefaultMethods(deps)({
					payment: { id, deviceId: deps.deviceId, currency: paymentCurrency },
					totalAmount: NonNegativeInteger(totalAmount),
					tipAmount: null,
					amountInBtc:
						amountInSats === null || amountInSats === undefined
							? undefined
							: NonNegativeInteger(amountInSats),
				});
				const invoices = await Promise.all(
					lnInvoiceTables.map((table) =>
						deps.evolu.loadQuery(createLnInvoiceQuery(table, id)),
					),
				);

				return text({
					id,
					currency: paymentCurrency,
					totalAmount: decimal(totalAmount, paymentCurrency),
					lnInvoice: invoices.flat()[0]?.lnInvoice ?? null,
				});
			}),
	);
};

const registerContactsReadTools = (server: McpServer, deps: AgentToolDeps) => {
	server.registerTool(
		"contacts_list",
		{
			title: "List contacts",
			description:
				"Lists the saved contacts with their name, label, email, phone and Lightning address.",
			annotations: readOnly,
		},
		() =>
			guard(async () =>
				text(
					(await deps.evolu.loadQuery(createGetContactsQuery())).map(
						(contact) => ({
							id: contact.id,
							name: contact.name,
							label: contact.label,
							email: contact.email,
							phone: contact.phone,
							lightningAddress: contact.account?.lud16?.lud16 ?? null,
						}),
					),
				),
			),
	);
};

const registerSettingsWriteTools = (server: McpServer, deps: AgentToolDeps) => {
	server.registerTool(
		"settings_set_default_currency",
		{
			title: "Set the default currency",
			description:
				"Sets the currency used for new catalog items, bills and payments. Records that already exist keep the currency they were created with. BTC means amounts are in sats.",
			inputSchema: {
				currency: z
					.enum(Currency)
					.describe("The new default currency, BTC for sats."),
			},
		},
		({ currency }) =>
			guard(async () => {
				const previousCurrency = await loadDefaultCurrency(deps);
				if (previousCurrency === null) {
					return refuse(
						"The venue has no billing settings yet, finish the onboarding first.",
					);
				}

				deps.evolu.update("billingSettings", {
					id: settingsId,
					defaultCurrency: currency,
				});

				return text({ defaultCurrency: currency, previousCurrency });
			}),
	);
	server.registerTool(
		"settings_set_language",
		{
			title: "Set the app language",
			description:
				"Switches the language the finito app is displayed in on this device.",
			inputSchema: {
				language: z
					.enum(SUPPORTED_LANGUAGES)
					.describe("The new app language, cs for Czech, en for English."),
			},
		},
		({ language }) =>
			guard(async () => {
				await deps.setLanguage(language);

				return text({ language });
			}),
	);
};

const registerDiagnosticsReadTools = (
	server: McpServer,
	deps: AgentToolDeps,
) => {
	server.registerTool(
		"diagnostics_list_errors",
		{
			title: "List the collected errors",
			description:
				"Lists the console errors, unhandled exceptions, failed loads and Evolu errors the finito app collected on this device, newest first. Read it to find what to fix.",
			inputSchema: {
				limit: z
					.number()
					.int()
					.min(1)
					.max(200)
					.optional()
					.describe("How many of the newest entries to return, 50 by default."),
			},
			annotations: readOnly,
		},
		({ limit }) =>
			guard(async () =>
				text(
					deps
						.readDiagnostics()
						.slice(0, limit ?? 50)
						.map((event) => ({
							at: new Date(event.at).toISOString(),
							level: event.level,
							source: event.source,
							page: event.page,
							count: event.count,
							message: event.message,
						})),
				),
			),
	);
};

const registrations: ReadonlyArray<
	[AiAgentScope, (server: McpServer, deps: AgentToolDeps) => void]
> = [
	[AiAgentScope.CatalogRead, registerCatalogReadTools],
	[AiAgentScope.CatalogWrite, registerCatalogWriteTools],
	[AiAgentScope.PosRead, registerPosReadTools],
	[AiAgentScope.PosWrite, registerPosWriteTools],
	[AiAgentScope.PaymentsRead, registerPaymentsReadTools],
	[AiAgentScope.PaymentsWrite, registerPaymentsWriteTools],
	[AiAgentScope.ContactsRead, registerContactsReadTools],
	[AiAgentScope.SettingsWrite, registerSettingsWriteTools],
	[AiAgentScope.DiagnosticsRead, registerDiagnosticsReadTools],
];

export const registerAgentTools = (
	server: McpServer,
	deps: AgentToolDeps,
	scopes: ReadonlySet<AiAgentScope>,
) => {
	for (const [scope, register] of registrations) {
		if (scopes.has(scope)) {
			register(server, deps);
		}
	}
};
