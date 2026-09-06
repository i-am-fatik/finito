import { type KyselyNotNull, sqliteTrue } from "@evolu/common";
import { createQuery } from "@/lib/evolu";
import type { EvoluDep } from "@/lib/shared/dependencies";

const gatewayAccountsQuery = createQuery((db) =>
	db
		.selectFrom("account")
		.innerJoin("accountLud16", "accountLud16.id", "account.id")
		.select([
			"account.id as id",
			"accountLud16.lud16 as lud16",
			"accountLud16.gatewayUrl as gatewayUrl",
			"accountLud16.gatewayToken as gatewayToken",
		] as const)
		.where("account.isDeleted", "is not", sqliteTrue)
		.where("accountLud16.isDeleted", "is not", sqliteTrue)
		.where("account._tag", "=", "accountLud16")
		.where("accountLud16.gatewayUrl", "is not", null)
		.$narrowType<{ gatewayUrl: KyselyNotNull }>(),
);

export const moveGatewayAccountsToThunderBridge = async (deps: EvoluDep) => {
	const accounts = await deps.evolu.loadQuery(gatewayAccountsQuery);

	for (const account of accounts) {
		deps.evolu.upsert("accountThunderBridge", {
			id: account.id,
			gatewayUrl: account.gatewayUrl,
			gatewayToken: account.gatewayToken,
			lud16: account.lud16,
			iban: null,
			fioReadToken: null,
		});
		deps.evolu.update("account", {
			id: account.id,
			_tag: "accountThunderBridge",
		});
		deps.evolu.update("accountLud16", {
			id: account.id,
			gatewayUrl: null,
			gatewayToken: null,
		});
	}

	return accounts.length;
};
