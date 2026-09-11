import { createIdFromString, sqliteTrue } from "@evolu/common";
import type { createAppEvolu } from "@/lib/evolu";
import type { DeviceEvolu } from "@/lib/evolu/device";
import type { Id } from "@/lib/evolu/types";
import {
	FiatCurrency,
	HttpsUrl,
	Iban,
	NonEmptyString255,
	PositiveInteger,
} from "@/lib/shared/types";
import {
	bootstrapE2eAccount,
	createE2eAppEvolu,
	ensureBillingSettings,
	ensureDeviceRow,
} from "@/lib/testing/e2e-primitives";
import type {
	BankScenarioInput,
	BankScenarioResult,
	E2EWorkerContext,
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

export const runBankScenario = async (
	deviceEvolu: DeviceEvolu,
	scenario: BankScenarioInput,
	context: E2EWorkerContext,
): Promise<BankScenarioResult> => {
	const { mnemonic, device } = await bootstrapE2eAccount(deviceEvolu, context);
	const evolu = await createE2eAppEvolu(mnemonic);

	await ensureDeviceRow(deviceEvolu, device);
	await ensureBillingSettings(evolu);

	const accountId = await inserted(evolu, "account", {
		deviceId: device.id,
		name: NonEmptyString255("E2E Bank"),
		_tag: "accountIban",
	});

	await upserted(evolu, "accountIban", {
		id: accountId,
		iban: Iban(scenario.iban),
		currency: FiatCurrency.CZK,
	});

	const fioPluginId = createIdFromString("") as Id;
	await upserted(evolu, "fioPlugin", {
		id: fioPluginId,
		apiUrl: HttpsUrl(scenario.apiUrl),
		numberOfSecondsBetweenChecks: PositiveInteger(1),
		isActive: sqliteTrue,
	});

	await inserted(evolu, "fioPluginToken", {
		fioPluginId,
		token: NonEmptyString255(scenario.token),
	});

	return {
		mnemonic,
		deviceId: device.id,
		accountId,
		iban: scenario.iban,
	};
};
