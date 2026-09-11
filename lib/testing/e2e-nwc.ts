import type { createAppEvolu } from "@/lib/evolu";
import type { DeviceEvolu } from "@/lib/evolu/device";
import type { Id } from "@/lib/evolu/types";
import { NonEmptyString255, NwcCredentials } from "@/lib/shared/types";
import {
	bootstrapE2eAccount,
	createE2eAppEvolu,
	ensureBillingSettings,
	ensureDeviceRow,
} from "@/lib/testing/e2e-primitives";
import type {
	E2EWorkerContext,
	NwcScenarioInput,
	NwcScenarioResult,
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

export const runNwcScenario = async (
	deviceEvolu: DeviceEvolu,
	scenario: NwcScenarioInput,
	context: E2EWorkerContext,
): Promise<NwcScenarioResult> => {
	const { mnemonic, device } = await bootstrapE2eAccount(deviceEvolu, context);
	const evolu = await createE2eAppEvolu(mnemonic);

	await ensureDeviceRow(deviceEvolu, device);
	await ensureBillingSettings(evolu);

	const accountId = await inserted(evolu, "account", {
		deviceId: device.id,
		name: NonEmptyString255("E2E NWC Wallet"),
		_tag: "accountNwc",
	});

	await upserted(evolu, "accountNwc", {
		id: accountId,
		credentials: NwcCredentials(scenario.credentials),
	});

	return {
		mnemonic,
		deviceId: device.id,
		accountId,
	};
};
