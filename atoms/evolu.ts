import { sqliteTrue } from "@evolu/common";
import { atom } from "jotai";
import { accountAtom } from "@/atoms/account";
import { createAppEvolu, createQuery } from "@/lib/evolu";
import { defaultAccountIds } from "@/lib/evolu/default-accounts";
import { moveGatewayAccountsToThunderBridge } from "@/lib/evolu/migrations/thunder-bridge-accounts";
import { PaymentDefaultMethodType } from "@/lib/evolu/model/payment-default-method";
import { FiatCurrency, NonEmptyString255 } from "@/lib/shared/types";

export const evoluAtom = atom(async (get) => {
	const account = await get(accountAtom);
	const evolu = await createAppEvolu({
		mnemonic: account.mnemonic,
		transports: account.transports,
	});
	const deviceId = account.device.id;

	// Seed initial data
	(async () => {
		// Copy device identification to the shared evolu instance. Skip waiting
		void (async () => {
			const data = await evolu.loadQuery(
				createQuery((db) =>
					db
						.selectFrom("device")
						.selectAll()
						.where("isDeleted", "is not", sqliteTrue)
						.where("id", "=", account.device.id),
				),
			);
			if (data.length === 0) {
				evolu.upsert("device", account.device);
			}
		})();

		const appOwner = await evolu.appOwner;
		if (appOwner.mnemonic === null || appOwner.mnemonic === undefined)
			throw new Error(
				"App owner mnemonic is not set. Please create a new account.",
			);

		await moveGatewayAccountsToThunderBridge({ evolu });

		// Create default accounts and payment methods
		{
			const {
				sparkAccountId,
				cashRegisterAccountId,
				sparkPaymentDefaultMethodId,
				cashRegisterPaymentDefaultMethodId,
			} = defaultAccountIds(appOwner.mnemonic);

			const sparkAccount = await evolu.loadQuery(
				createQuery((db) =>
					db
						.selectFrom("account")
						.selectAll()
						.where("isDeleted", "is not", sqliteTrue)
						.where("id", "=", sparkAccountId),
				),
			);

			if (sparkAccount.length === 0) {
				evolu.upsert("account", {
					id: sparkAccountId,
					deviceId,
					name: NonEmptyString255("Default"),
					_tag: "accountSpark",
				});
				evolu.upsert("accountSpark", {
					id: sparkAccountId,
					mnemonic: NonEmptyString255(appOwner.mnemonic),
				});
			}

			const cashRegisterAccount = await evolu.loadQuery(
				createQuery((db) =>
					db
						.selectFrom("account")
						.selectAll()
						.where("isDeleted", "is not", sqliteTrue)
						.where("id", "=", cashRegisterAccountId),
				),
			);

			if (cashRegisterAccount.length === 0) {
				evolu.upsert("account", {
					id: cashRegisterAccountId,
					deviceId,
					name: NonEmptyString255("Cash Register"),
					_tag: "accountCashRegister",
				});
				evolu.upsert("accountCashRegister", {
					id: cashRegisterAccountId,
					currency: FiatCurrency.CZK,
				});
			}

			const sparkPaymentDefaultMethod = await evolu.loadQuery(
				createQuery((db) =>
					db
						.selectFrom("paymentDefaultMethod")
						.selectAll()
						.where("isDeleted", "is not", sqliteTrue)
						.where("id", "=", sparkPaymentDefaultMethodId),
				),
			);

			if (sparkPaymentDefaultMethod.length === 0) {
				evolu.upsert("paymentDefaultMethod", {
					id: sparkPaymentDefaultMethodId,
					type: PaymentDefaultMethodType.BtcLn,
					accountId: sparkAccountId,
					pausedAt: null,
				});
			}

			const cashRegisterPaymentDefaultMethod = await evolu.loadQuery(
				createQuery((db) =>
					db
						.selectFrom("paymentDefaultMethod")
						.selectAll()
						.where("isDeleted", "is not", sqliteTrue)
						.where("id", "=", cashRegisterPaymentDefaultMethodId),
				),
			);

			if (cashRegisterPaymentDefaultMethod.length === 0) {
				evolu.upsert("paymentDefaultMethod", {
					id: cashRegisterPaymentDefaultMethodId,
					type: PaymentDefaultMethodType.Cash,
					accountId: cashRegisterAccountId,
					pausedAt: null,
				});
			}
		}
	})();

	return evolu;
});
