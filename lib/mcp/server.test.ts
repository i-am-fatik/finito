import { describe, expect, it } from "bun:test";
import { AiAgentScope } from "@/lib/evolu/model/ai-agent";
import { handleMcpHttpRequest } from "@/lib/mcp/server";
import { hashAgentToken } from "@/lib/mcp/token";
import type { AgentToolDeps } from "@/lib/mcp/tools";
import {
	type EvoluRow,
	setupEvolu,
	sqlOf,
	writesTo,
} from "@/lib/test-support/evolu";

const token = `finito_mcp_${"3c".repeat(32)}`;
const revokedToken = `finito_mcp_${"9e".repeat(32)}`;
const deviceId = "device-1";
const now = 1_760_000_000_000;

const agentRow = (params: {
	scopes: ReadonlyArray<AiAgentScope>;
	lastUsedAt?: number | null;
}): EvoluRow => ({
	id: "agent-1",
	label: "Kitchen bot",
	lastUsedAt: params.lastUsedAt ?? null,
	scopes: params.scopes.map((scope) => ({ scope })),
});

const catalogRow = {
	id: "item-1",
	deviceId,
	label: "Pivo",
	price: 5000,
	costPrice: null,
	currency: "CZK",
	unitOfMeasure: null,
	internalCode: null,
	productCodeType: null,
	productCodeValue: null,
	categoryId: null,
};

const tableRow = {
	id: "table-1",
	label: "Zahrada",
	numberOfSeats: 4,
};

const tableCodeRow = {
	id: "code-1",
	tableId: "table-1",
	code: "old-code",
};

const billRow = {
	id: "bill-1",
	deviceId,
	displayId: 1,
	label: null,
	currency: "CZK",
	tableId: null,
	table: null,
	items: [],
	rates: [],
};

const paramsOf = (query: string) =>
	(JSON.parse(query)[1] as ReadonlyArray<readonly [string, unknown]>).map(
		([, value]) => value,
	);

const setup = (params: {
	scopes: ReadonlyArray<AiAgentScope>;
	lastUsedAt?: number | null;
}) => {
	const evolu = setupEvolu({
		rowsFor: (query) => {
			const sql = sqlOf(query);
			if (sql.includes('from "aiAgent"')) {
				const lookedUp = paramsOf(query);
				if (lookedUp.includes(hashAgentToken(token))) {
					return [agentRow(params)];
				}
				if (
					lookedUp.includes(hashAgentToken(revokedToken)) &&
					!sql.includes('"aiAgent"."isDeleted" is not')
				) {
					return [agentRow(params)];
				}
				return [];
			}
			if (sql.includes('from "catalogItem"')) {
				return [catalogRow];
			}
			if (sql.includes('from "category"')) {
				return [];
			}
			if (sql.includes('from "posBill"')) {
				return [billRow];
			}
			if (sql.includes('from "billingSettings"')) {
				return [{ defaultCurrency: "CZK" }];
			}
			if (sql.includes('from "item"')) {
				return [];
			}
			if (sql.includes('from "tableCode"')) {
				return [tableCodeRow];
			}
			if (sql.includes('from "table"')) {
				return [tableRow];
			}
			return [];
		},
	});
	const languages: string[] = [];
	const deps = {
		evolu: evolu.evolu,
		ndk: {},
		deviceId,
		now: () => now,
		setLanguage: async (language: string) => {
			languages.push(language);
		},
	} as unknown as AgentToolDeps & { now: () => number };

	return { ...evolu, languages, handle: handleMcpHttpRequest(deps) };
};

const post = (params: {
	body: unknown;
	token?: string | null;
	rawBody?: string;
}) => ({
	id: 1,
	method: "POST",
	uri: "/mcp",
	headers: [
		["content-type", "application/json"],
		["accept", "application/json, text/event-stream"],
		...(params.token === null
			? []
			: [["authorization", `Bearer ${params.token ?? token}`] as const]),
	] as ReadonlyArray<readonly [string, string]>,
	body: params.rawBody ?? JSON.stringify(params.body),
});

const rpc = (method: string, params?: unknown) => ({
	jsonrpc: "2.0",
	id: 7,
	method,
	params,
});

const resultOf = (response: { body: string }) =>
	JSON.parse(response.body) as {
		result?: {
			tools?: Array<{ name: string }>;
			content?: Array<{ text: string }>;
			isError?: boolean;
		};
		error?: { code: number; message: string };
	};

describe("handleMcpHttpRequest", () => {
	it("answers 401 with a bearer challenge when no token is sent and never touches the database", async () => {
		const { handle, loadedQueries } = setup({ scopes: [] });

		const response = await handle(
			post({ body: rpc("tools/list"), token: null }),
		);

		expect(response.status).toBe(401);
		expect(response.headers).toContainEqual([
			"www-authenticate",
			'Bearer realm="finito", error="invalid_token"',
		]);
		expect(loadedQueries).toHaveLength(0);
	});

	it("answers 401 for an unknown token", async () => {
		const { handle } = setup({ scopes: [AiAgentScope.CatalogRead] });

		const response = await handle(
			post({ body: rpc("tools/list"), token: `finito_mcp_${"00".repeat(32)}` }),
		);

		expect(response.status).toBe(401);
		expect(resultOf(response).error?.message).toBe("Unknown or revoked token.");
	});

	it("answers 401 for a revoked token because the lookup skips deleted agents", async () => {
		const { handle } = setup({ scopes: [AiAgentScope.CatalogRead] });

		const response = await handle(
			post({ body: rpc("tools/list"), token: revokedToken }),
		);

		expect(response.status).toBe(401);
	});

	it("refuses a JSON-RPC batch and unparsable JSON with 400", async () => {
		const { handle } = setup({ scopes: [AiAgentScope.CatalogRead] });

		const batch = await handle(post({ body: [rpc("tools/list")] }));
		const garbage = await handle(post({ body: null, rawBody: "{not json" }));

		expect(batch.status).toBe(400);
		expect(resultOf(batch).error?.code).toBe(-32600);
		expect(garbage.status).toBe(400);
		expect(resultOf(garbage).error?.code).toBe(-32700);
	});

	it("lists only the tools of the granted scopes", async () => {
		const { handle } = setup({
			scopes: [AiAgentScope.CatalogRead, AiAgentScope.PosRead],
		});

		const response = await handle(post({ body: rpc("tools/list") }));

		expect(response.status).toBe(200);
		expect(resultOf(response).result?.tools?.map((tool) => tool.name)).toEqual([
			"catalog_list_items",
			"pos_list_tables",
			"pos_list_open_bills",
		]);
	});

	it("does not know a tool outside the granted scopes", async () => {
		const { handle, inserts } = setup({ scopes: [AiAgentScope.CatalogRead] });

		const response = await handle(
			post({
				body: rpc("tools/call", {
					name: "catalog_create_item",
					arguments: { label: "Pivo", price: "50" },
				}),
			}),
		);

		expect(response.status).toBe(200);
		expect(resultOf(response).result?.isError).toBe(true);
		expect(resultOf(response).result?.content?.[0]?.text).toContain(
			"catalog_create_item not found",
		);
		expect(inserts).toHaveLength(0);
	});

	it("creates a catalog item in minor units for the device that hosts the agent", async () => {
		const { handle, inserts } = setup({ scopes: [AiAgentScope.CatalogWrite] });

		const response = await handle(
			post({
				body: rpc("tools/call", {
					name: "catalog_create_item",
					arguments: { label: " Espresso ", price: "59,90", currency: "CZK" },
				}),
			}),
		);

		expect(resultOf(response).result?.isError).toBeUndefined();
		expect(writesTo(inserts, "catalogItem")).toEqual([
			{
				table: "catalogItem",
				values: expect.objectContaining({
					label: "Espresso",
					price: 5990,
					currency: "CZK",
					deviceId,
				}),
			},
		]);
	});

	it("reprices a catalog item in the currency it was created with", async () => {
		const { handle, updates } = setup({ scopes: [AiAgentScope.CatalogWrite] });

		const response = await handle(
			post({
				body: rpc("tools/call", {
					name: "catalog_update_item",
					arguments: { itemId: "item-1", price: "89,50" },
				}),
			}),
		);

		expect(resultOf(response).result?.isError).toBeUndefined();
		expect(writesTo(updates, "catalogItem")).toEqual([
			{ table: "catalogItem", values: { id: "item-1", price: 8950 } },
		]);
	});

	it("creates a table for the device that hosts the agent", async () => {
		const { handle, inserts } = setup({ scopes: [AiAgentScope.PosWrite] });

		const response = await handle(
			post({
				body: rpc("tools/call", {
					name: "pos_create_table",
					arguments: { label: " Stul 1 ", numberOfSeats: 4 },
				}),
			}),
		);

		expect(resultOf(response).result?.isError).toBeUndefined();
		expect(writesTo(inserts, "table")).toEqual([
			{
				table: "table",
				values: expect.objectContaining({
					label: "Stul 1",
					numberOfSeats: 4,
					deviceId,
				}),
			},
		]);
	});

	it("replaces the code a table already has", async () => {
		const { handle, inserts, updates } = setup({
			scopes: [AiAgentScope.PosWrite],
		});

		const response = await handle(
			post({
				body: rpc("tools/call", {
					name: "pos_set_table_code",
					arguments: { tableId: "table-1", code: " bar-1 " },
				}),
			}),
		);

		expect(resultOf(response).result?.isError).toBeUndefined();
		expect(writesTo(updates, "tableCode")).toEqual([
			{
				table: "tableCode",
				values: expect.objectContaining({ id: "code-1" }),
			},
		]);
		expect(writesTo(inserts, "tableCode")).toEqual([
			{
				table: "tableCode",
				values: expect.objectContaining({ tableId: "table-1", code: "bar-1" }),
			},
		]);
	});

	it("switches the app language on the device that hosts the agent", async () => {
		const { handle, languages } = setup({
			scopes: [AiAgentScope.SettingsWrite],
		});

		const response = await handle(
			post({
				body: rpc("tools/call", {
					name: "settings_set_language",
					arguments: { language: "cs" },
				}),
			}),
		);

		expect(resultOf(response).result?.isError).toBeUndefined();
		expect(languages).toEqual(["cs"]);
	});

	it("prices a bill line from the catalog, never from the agent", async () => {
		const { handle, inserts } = setup({ scopes: [AiAgentScope.PosWrite] });

		const response = await handle(
			post({
				body: rpc("tools/call", {
					name: "pos_add_item_to_bill",
					arguments: {
						billId: "bill-1",
						catalogItemId: "item-1",
						quantity: 3,
						totalAmount: 1,
					},
				}),
			}),
		);

		expect(resultOf(response).result?.isError).toBeUndefined();
		expect(writesTo(inserts, "posBillItemLine")).toEqual([
			{
				table: "posBillItemLine",
				values: expect.objectContaining({
					posBillId: "bill-1",
					catalogItemId: "item-1",
					_tag: "add",
					quantity: 3,
					totalAmount: 15000,
					deviceId,
				}),
			},
		]);
	});

	it("refuses to add an item priced in another currency than the bill", async () => {
		const { handle, inserts } = setup({ scopes: [AiAgentScope.PosWrite] });

		const response = await handle(
			post({
				body: rpc("tools/call", {
					name: "pos_add_item_to_bill",
					arguments: { billId: "bill-1", catalogItemId: "item-1", quantity: 1 },
				}),
			}),
		);
		expect(resultOf(response).result?.isError).toBeUndefined();

		catalogRow.currency = "EUR";
		try {
			const mismatch = await handle(
				post({
					body: rpc("tools/call", {
						name: "pos_add_item_to_bill",
						arguments: {
							billId: "bill-1",
							catalogItemId: "item-1",
							quantity: 1,
						},
					}),
				}),
			);
			expect(resultOf(mismatch).result?.isError).toBe(true);
			expect(resultOf(mismatch).result?.content?.[0]?.text).toContain("EUR");
		} finally {
			catalogRow.currency = "CZK";
		}
		expect(writesTo(inserts, "posBillItemLine")).toHaveLength(1);
	});

	it("stamps lastUsedAt at most once per five minutes", async () => {
		const fresh = setup({
			scopes: [AiAgentScope.CatalogRead],
			lastUsedAt: null,
		});
		await fresh.handle(post({ body: rpc("tools/list") }));
		expect(writesTo(fresh.updates, "aiAgent")).toEqual([
			{ table: "aiAgent", values: { id: "agent-1", lastUsedAt: now } },
		]);

		const recent = setup({
			scopes: [AiAgentScope.CatalogRead],
			lastUsedAt: now - 60_000,
		});
		await recent.handle(post({ body: rpc("tools/list") }));
		expect(writesTo(recent.updates, "aiAgent")).toHaveLength(0);

		const stale = setup({
			scopes: [AiAgentScope.CatalogRead],
			lastUsedAt: now - 6 * 60_000,
		});
		await stale.handle(post({ body: rpc("tools/list") }));
		expect(writesTo(stale.updates, "aiAgent")).toHaveLength(1);
	});

	it("tells the model which grants it holds", async () => {
		const { handle } = setup({ scopes: [AiAgentScope.ContactsRead] });

		const response = await handle(
			post({
				body: rpc("initialize", {
					protocolVersion: "2025-06-18",
					capabilities: {},
					clientInfo: { name: "test", version: "1" },
				}),
			}),
		);

		expect(response.status).toBe(200);
		expect(JSON.parse(response.body).result.instructions).toContain(
			'agent "Kitchen bot"',
		);
		expect(JSON.parse(response.body).result.instructions).toContain(
			"contacts_read",
		);
	});
});
