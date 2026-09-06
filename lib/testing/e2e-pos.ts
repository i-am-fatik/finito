import type { createAppEvolu } from "@/lib/evolu";
import { defaultAccountIds } from "@/lib/evolu/default-accounts";
import type { DeviceEvolu } from "@/lib/evolu/device";
import { PaymentDefaultMethodType } from "@/lib/evolu/model/payment-default-method";
import type { Id } from "@/lib/evolu/types";
import {
	FiatCurrency,
	NonEmptyString255,
	TimestampMs,
} from "@/lib/shared/types";
import {
	bootstrapE2eAccount,
	createE2eAppEvolu,
	ensureBillingSettings,
	ensureDeviceRow,
	insertCatalogItem,
} from "@/lib/testing/e2e-primitives";
import type {
	E2EWorkerContext,
	PosChargeScenarioInput,
	PosChargeScenarioResult,
} from "@/lib/testing/e2e-types";

const completed = (run: (onComplete: () => void) => unknown) =>
	new Promise<void>((resolve) => {
		run(resolve);
	});

const ensureCashOnlyTill = async (
	evolu: Awaited<ReturnType<typeof createAppEvolu>>,
	mnemonic: string,
	deviceId: Id,
) => {
	const ids = defaultAccountIds(mnemonic);
	await completed((onComplete) =>
		evolu.upsert(
			"account",
			{
				id: ids.cashRegisterAccountId,
				deviceId,
				name: NonEmptyString255("Cash Register"),
				_tag: "accountCashRegister",
			},
			{ onComplete },
		),
	);
	await completed((onComplete) =>
		evolu.upsert(
			"accountCashRegister",
			{
				id: ids.cashRegisterAccountId,
				currency: FiatCurrency.CZK,
			},
			{ onComplete },
		),
	);
	await completed((onComplete) =>
		evolu.upsert(
			"paymentDefaultMethod",
			{
				id: ids.cashRegisterPaymentDefaultMethodId,
				type: PaymentDefaultMethodType.Cash,
				accountId: ids.cashRegisterAccountId,
				pausedAt: null,
			},
			{ onComplete },
		),
	);
	await completed((onComplete) =>
		evolu.upsert(
			"paymentDefaultMethod",
			{
				id: ids.sparkPaymentDefaultMethodId,
				type: PaymentDefaultMethodType.BtcLn,
				accountId: ids.sparkAccountId,
				pausedAt: TimestampMs(Date.now()),
			},
			{ onComplete },
		),
	);

	return ids.cashRegisterAccountId;
};

export const runPosChargeScenario = async (
	deviceEvolu: DeviceEvolu,
	scenario: PosChargeScenarioInput,
	context: E2EWorkerContext,
): Promise<PosChargeScenarioResult> => {
	const { mnemonic, device } = await bootstrapE2eAccount(deviceEvolu, context);
	const evolu = await createE2eAppEvolu(mnemonic);

	await ensureDeviceRow(deviceEvolu, device);
	await ensureBillingSettings(evolu);
	const cashAccountId = await ensureCashOnlyTill(evolu, mnemonic, device.id);
	const item = await insertCatalogItem(evolu, {
		deviceId: device.id,
		label: scenario.item?.label ?? "E2E Till Item",
		price: scenario.item?.price,
	});

	return {
		mnemonic,
		deviceId: device.id,
		cashAccountId,
		item,
	};
};
