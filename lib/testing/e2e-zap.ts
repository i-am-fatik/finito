import { sqliteTrue } from "@evolu/common";
import { type createAppEvolu, createQuery } from "@/lib/evolu";
import type { DeviceEvolu } from "@/lib/evolu/device";
import type { Id } from "@/lib/evolu/types";
import {
	Currency,
	Email,
	Integer,
	NonEmptyString,
	NonEmptyString255,
	NonNegativeInteger,
	TimestampSec,
} from "@/lib/shared/types";
import {
	bootstrapE2eAccount,
	createE2eAppEvolu,
	ensureBillingSettings,
	ensureDeviceRow,
} from "@/lib/testing/e2e-primitives";
import type {
	E2EWorkerContext,
	ZapScenarioInput,
	ZapScenarioResult,
} from "@/lib/testing/e2e-types";

type AppEvolu = Awaited<ReturnType<typeof createAppEvolu>>;

const inserted = <TValues extends Record<string, unknown>>(
	evolu: AppEvolu,
	table: string,
	values: TValues,
) =>
	new Promise<Id>((resolve) => {
		const { id } = evolu.insert(table as never, values as never, {
			onComplete: () => {
				resolve(id as Id);
			},
		});
	});

const upserted = <TValues extends Record<string, unknown>>(
	evolu: AppEvolu,
	table: string,
	values: TValues,
) =>
	new Promise<void>((resolve) => {
		evolu.upsert(table as never, values as never, {
			onComplete: resolve,
		});
	});

export const runZapScenario = async (
	deviceEvolu: DeviceEvolu,
	scenario: ZapScenarioInput,
	context: E2EWorkerContext,
): Promise<ZapScenarioResult> => {
	const { mnemonic, device } = await bootstrapE2eAccount(deviceEvolu, context);
	const evolu = await createE2eAppEvolu(mnemonic);

	await ensureDeviceRow(deviceEvolu, device);
	await ensureBillingSettings(evolu);

	const accountId = await inserted(evolu, "account", {
		deviceId: device.id,
		name: NonEmptyString255("E2E Zap Wallet"),
		_tag: "accountLud16",
	});

	await upserted(evolu, "accountLud16", {
		id: accountId,
		lud16: Email(scenario.lud16),
		gatewayUrl: null,
		gatewayToken: null,
	});

	const paymentId = await inserted(evolu, "payment", {
		deviceId: device.id,
		direction: "incoming",
		totalAmount: Integer(scenario.amountSats),
		currency: Currency.BTC,
		tipAmount: null,
	});

	await upserted(evolu, "paymentLnZap", {
		id: paymentId,
		accountId,
		lnInvoice: NonEmptyString(scenario.lnInvoice),
		paymentHash: NonEmptyString(scenario.paymentHash),
		privateKey: NonEmptyString(scenario.privateKey),
		walletPubkey: NonEmptyString(scenario.walletPubkey),
		amount: NonNegativeInteger(scenario.amountSats),
		expirationIn: TimestampSec(scenario.expiresAtSec),
	});

	await upserted(evolu, "paymentWatchingState", {
		id: paymentId,
		verifiedAt: null,
		proveType: null,
		transactionId: null,
		stoppedAt: null,
		stopReason: null,
	});

	const watched = await evolu.loadQuery(
		createQuery((db) =>
			db
				.selectFrom("payment")
				.innerJoin("paymentLnZap", "paymentLnZap.id", "payment.id")
				.innerJoin(
					"paymentWatchingState",
					"paymentWatchingState.id",
					"payment.id",
				)
				.select(["payment.id as id"] as const)
				.where("payment.isDeleted", "is not", sqliteTrue)
				.where("paymentLnZap.isDeleted", "is not", sqliteTrue)
				.where("paymentWatchingState.isDeleted", "is not", sqliteTrue)
				.where("paymentWatchingState.verifiedAt", "is", null)
				.where("paymentWatchingState.stoppedAt", "is", null),
		),
	);

	return {
		mnemonic,
		deviceId: device.id,
		accountId,
		paymentId,
		watchable: watched.length,
	};
};
