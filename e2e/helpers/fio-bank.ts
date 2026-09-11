import type { BrowserContext } from "@playwright/test";

const fioHost = "fio.finito-e2e.example";

export const fioApiUrl = `https://${fioHost}`;
export const fioToken = "e2e-fio-token";
export const fioIban = "CZ6508000000192000145399";

type StatementTransaction = {
	amount: number;
	variableSymbol: string;
	note: string;
	occurredOn: string;
};

const columnsOf = (transaction: StatementTransaction) => ({
	column0: { value: transaction.occurredOn, name: "Datum" },
	column1: { value: transaction.amount, name: "Objem" },
	column5: { value: transaction.variableSymbol, name: "VS" },
	column8: { value: transaction.note, name: "Typ" },
	column14: { value: "CZK", name: "Měna" },
});

export const fakeFioBank = (params?: { iban?: string }) => {
	const iban = params?.iban ?? fioIban;
	const statement: StatementTransaction[] = [];

	return {
		apiUrl: fioApiUrl,
		token: fioToken,
		iban,
		report: (transaction: StatementTransaction) => {
			statement.push(transaction);
		},
		serve: async (context: BrowserContext) => {
			await context.route(
				`${fioApiUrl}/v1/rest/last/*/transactions.json`,
				async (route) =>
					await route.fulfill({
						json: {
							accountStatement: {
								info: { iban },
								transactionList: {
									transaction: statement.map(columnsOf),
								},
							},
						},
					}),
			);
		},
	};
};

export type FakeFioBank = ReturnType<typeof fakeFioBank>;
