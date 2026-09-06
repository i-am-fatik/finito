import { describe, expect, it } from "bun:test";
import { moveGatewayAccountsToThunderBridge } from "@/lib/evolu/migrations/thunder-bridge-accounts";
import {
	type EvoluRow,
	setupEvolu,
	sqlOf,
	writesTo,
} from "@/lib/test-support/evolu";

const accountId = "account-with-gateway";

const setup = (rows: ReadonlyArray<EvoluRow>) =>
	setupEvolu({ rowsFor: () => rows });

const gatewayAccount = {
	id: accountId,
	lud16: "iamfatik@blink.sv",
	gatewayUrl: "https://gateway.invalid",
	gatewayToken: "secret",
};

describe("moveGatewayAccountsToThunderBridge", () => {
	it("writes the gateway of a lud16 account into a Thunder Bridge one", async () => {
		const { evolu, upserts } = setup([gatewayAccount]);

		expect(await moveGatewayAccountsToThunderBridge({ evolu })).toBe(1);
		expect(writesTo(upserts, "accountThunderBridge")).toEqual([
			{
				table: "accountThunderBridge",
				values: {
					id: accountId,
					gatewayUrl: "https://gateway.invalid",
					gatewayToken: "secret",
					lud16: "iamfatik@blink.sv",
					iban: null,
					fioReadToken: null,
				},
			},
		]);
	});

	it("retags the account so the till mints through the gateway", async () => {
		const { evolu, updates } = setup([gatewayAccount]);

		await moveGatewayAccountsToThunderBridge({ evolu });

		expect(writesTo(updates, "account")).toEqual([
			{
				table: "account",
				values: { id: accountId, _tag: "accountThunderBridge" },
			},
		]);
	});

	it("clears the gateway off the lud16 row so it cannot be read twice", async () => {
		const { evolu, updates } = setup([gatewayAccount]);

		await moveGatewayAccountsToThunderBridge({ evolu });

		expect(writesTo(updates, "accountLud16")).toEqual([
			{
				table: "accountLud16",
				values: { id: accountId, gatewayUrl: null, gatewayToken: null },
			},
		]);
	});

	it("writes nothing when no account carries a gateway", async () => {
		const { evolu, upserts, updates } = setup([]);

		expect(await moveGatewayAccountsToThunderBridge({ evolu })).toBe(0);
		expect(upserts).toHaveLength(0);
		expect(updates).toHaveLength(0);
	});

	it("asks only for lud16 accounts that still carry a gateway", async () => {
		const { evolu, loadedQueries } = setup([]);

		await moveGatewayAccountsToThunderBridge({ evolu });

		const sql = sqlOf(loadedQueries[0] ?? "[]");
		expect(sql).toContain('"accountLud16"."gatewayUrl" is not null');
		expect(sql).toContain('"account"."_tag" = ?');
	});
});
