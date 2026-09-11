import { beforeEach, describe, expect, it, mock } from "bun:test";
import { createIdFromString, sqliteTrue } from "@evolu/common";
import type { NotificationUI } from "@/hooks/use-background-processes";
import type { BackgroundProcess } from "@/lib/background/service";
import { variableSymbolForPayment } from "@/lib/payment/variable-symbol";
import { type EvoluRow, setupEvolu, writesTo } from "@/lib/test-support/evolu";

const ibanAccountId = createIdFromString("ibanAccount");
const bridgeAccountId = createIdFromString("bridgeAccount");
const paymentId = createIdFromString("bankPayment");
const iban = "CZ1111111111111111111111";
const otherIban = "CZ2222222222222222222222";
const pluginToken = "invented-plugin-token";
const bridgeToken = "invented-bridge-token";
const variableSymbol = variableSymbolForPayment(paymentId);

type StatementTransaction = {
	type: string;
	variableSymbol: string;
	currency: string;
	amount: number;
};

const incomingTransfer = (
	amount: number,
	symbol: string = variableSymbol,
): StatementTransaction => ({
	type: "Bezhotovostní příjem",
	variableSymbol: symbol,
	currency: "CZK",
	amount,
});

const statementOf = (params: {
	iban: string;
	transactions: ReadonlyArray<StatementTransaction>;
}) => ({
	accountStatement: {
		info: { iban: params.iban },
		transactionList: {
			transaction: params.transactions.map((transfer) => ({
				Typ: transfer.type,
				VS: transfer.variableSymbol,
				Měna: transfer.currency,
				Objem: transfer.amount,
				Datum: "2026-09-11+0200",
			})),
		},
	},
});

type StatementResponse = ReturnType<typeof statementOf>;

let clientTokens: string[][] = [];
let statement: StatementResponse = statementOf({ iban, transactions: [] });

class FakeFioApiClient {
	constructor(
		readonly tokens: string[],
		readonly apiUrl: string,
	) {
		clientTokens.push(tokens);
	}

	getTransactions() {
		return Promise.resolve(statement);
	}
}

mock.module("@/lib/integrations/fio/client", () => ({
	FioApiClient: FakeFioApiClient,
}));

const { syncFioTransfersProcess } = await import(
	"@/lib/background/processes/sync-fio-transfers-process"
);

const flushPendingWork = async () => {
	for (let tick = 0; tick < 50; tick += 1) {
		await Promise.resolve();
	}
};

const setupProcess = (params?: {
	isActive?: number;
	pluginTokens?: ReadonlyArray<string>;
	ibanAccounts?: ReadonlyArray<EvoluRow>;
	bridgeAccounts?: ReadonlyArray<EvoluRow>;
	matchedPayments?: ReadonlyArray<EvoluRow>;
	expectedProductAmount?: number;
	expectedTipAmount?: number | null;
}) => {
	const evoluFake = setupEvolu({
		rowsFor: (query) => {
			if (query.includes("numberOfSecondsBetweenChecks")) {
				return [
					{
						apiUrl: "https://fio.invalid",
						numberOfSecondsBetweenChecks: 30,
						isActive: params?.isActive ?? sqliteTrue,
					},
				];
			}
			if (query.includes("fioPluginToken")) {
				return (params?.pluginTokens ?? [pluginToken]).map((token) => ({
					token,
				}));
			}
			if (query.includes("fioReadToken")) {
				return (
					params?.bridgeAccounts ?? [
						{ id: bridgeAccountId, iban: null, fioReadToken: bridgeToken },
					]
				);
			}
			if (query.includes("accountIban")) {
				return (
					params?.ibanAccounts ?? [{ id: ibanAccountId, iban, currency: "CZK" }]
				);
			}
			if (query.includes("expectedProductAmount")) {
				return [
					{
						tipAmount: params?.expectedTipAmount ?? null,
						expectedProductAmount: params?.expectedProductAmount ?? 15000,
					},
				];
			}
			if (query.includes("paymentBankTransferCZ")) {
				return params?.matchedPayments ?? [{ id: paymentId }];
			}
			return [];
		},
	});

	const reports: NotificationUI[] = [];

	const run = () =>
		syncFioTransfersProcess.run({
			evolu: evoluFake.evolu,
			addNotification: (notification: NotificationUI) => {
				reports.push(notification);

				return {
					update: (updated: NotificationUI) => {
						reports.push(updated);
					},
					delete: () => {},
				};
			},
		} as unknown as Parameters<BackgroundProcess["run"]>[0]);

	return { ...evoluFake, reports, run };
};

const lastReport = (reports: ReadonlyArray<NotificationUI>) =>
	reports[reports.length - 1];

beforeEach(() => {
	clientTokens = [];
	statement = statementOf({ iban, transactions: [] });
});

describe("syncFioTransfersProcess", () => {
	it("books an incoming transfer against the iban account that owns the statement", async () => {
		statement = statementOf({ iban, transactions: [incomingTransfer(15000)] });
		const { run, upserts } = setupProcess();

		const stop = await run();
		await flushPendingWork();
		stop();

		expect(writesTo(upserts, "transaction")[0]?.values).toMatchObject({
			accountId: ibanAccountId,
			_tag: "accountIban",
			amount: 15000,
			currency: "CZK",
		});
		expect(writesTo(upserts, "transactionIban")[0]?.values).toMatchObject({
			variableSymbol,
		});
	});

	it("reads the statement with the token a bridge account carries", async () => {
		statement = statementOf({
			iban: otherIban,
			transactions: [incomingTransfer(15000)],
		});
		const { run, upserts } = setupProcess({
			pluginTokens: [],
			bridgeAccounts: [
				{ id: bridgeAccountId, iban: otherIban, fioReadToken: bridgeToken },
			],
		});

		const stop = await run();
		await flushPendingWork();
		stop();

		expect(clientTokens[0]).toEqual([bridgeToken]);
		expect(writesTo(upserts, "transaction")[0]?.values).toMatchObject({
			accountId: bridgeAccountId,
			_tag: "accountThunderBridge",
		});
	});

	it("marks the payment whose variable symbol arrived as verified", async () => {
		statement = statementOf({ iban, transactions: [incomingTransfer(15000)] });
		const { run, updates, upserts } = setupProcess();

		const stop = await run();
		await flushPendingWork();
		stop();

		expect(writesTo(upserts, "reconciliationClaim")[0]?.values).toMatchObject({
			entityId: paymentId,
			rule: "bankVariableSymbol",
			createdBy: "syncFioTransfersProcess",
		});
		expect(writesTo(updates, "paymentWatchingState")[0]?.values).toMatchObject({
			id: paymentId,
			proveType: "bankTransferCZ",
		});
	});

	it("books a transfer whose variable symbol matches no payment without settling anything", async () => {
		statement = statementOf({ iban, transactions: [incomingTransfer(15000)] });
		const { run, updates, upserts } = setupProcess({ matchedPayments: [] });

		const stop = await run();
		await flushPendingWork();
		stop();

		expect(writesTo(upserts, "transaction")).toHaveLength(1);
		expect(writesTo(upserts, "reconciliationClaim")).toHaveLength(0);
		expect(writesTo(updates, "paymentWatchingState")).toHaveLength(0);
	});

	it("books nothing when the statement belongs to no account it knows", async () => {
		statement = statementOf({
			iban: otherIban,
			transactions: [incomingTransfer(15000)],
		});
		const { run, upserts, reports } = setupProcess();

		const stop = await run();
		await flushPendingWork();
		stop();

		expect(writesTo(upserts, "transaction")).toHaveLength(0);
		expect(lastReport(reports)?.description).toContain(
			`No IBAN account found for ${otherIban}`,
		);
	});

	it("stays paused while the plugin is switched off", async () => {
		statement = statementOf({ iban, transactions: [incomingTransfer(15000)] });
		const { run, upserts, reports } = setupProcess({ isActive: 0 });

		const stop = await run();
		await flushPendingWork();
		stop();

		expect(clientTokens).toHaveLength(0);
		expect(writesTo(upserts, "transaction")).toHaveLength(0);
		expect(lastReport(reports)?.description).toContain("Plugin is inactive");
	});
});
