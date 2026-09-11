import { NDKPrivateKeySigner } from "@nostr-dev-kit/ndk";
import { privateKeyFromSeedWords } from "nostr-tools/nip06";
import type { createAppEvolu } from "@/lib/evolu";
import { defaultAccountIds } from "@/lib/evolu/default-accounts";
import type { DeviceEvolu } from "@/lib/evolu/device";
import { PaymentDefaultMethodType } from "@/lib/evolu/model/payment-default-method";
import type { Id } from "@/lib/evolu/types";
import {
	Currency,
	Email,
	HttpsUrl,
	Integer,
	NonEmptyString255,
	PositiveInteger,
	PositiveNumber,
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
	TableScenarioInput,
	TableScenarioResult,
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

export const runTableScenario = async (
	deviceEvolu: DeviceEvolu,
	scenario: TableScenarioInput,
	context: E2EWorkerContext,
): Promise<TableScenarioResult> => {
	const { mnemonic, device } = await bootstrapE2eAccount(deviceEvolu, context);
	const evolu = await createE2eAppEvolu(mnemonic);

	const venueName = scenario.venueName ?? "E2E Venue";
	const label = scenario.item?.label ?? "E2E Table Beer";
	const price = scenario.item?.price ?? 12_000;
	const quantity = scenario.item?.quantity ?? 2;
	const tableLabel = scenario.table?.label ?? "T1";
	const code = scenario.table?.code ?? "Q1";

	await ensureDeviceRow(deviceEvolu, device);
	await ensureBillingSettings(evolu, { venueName });

	const catalogItem = await insertCatalogItem(evolu, {
		deviceId: device.id,
		label,
		price,
	});

	const itemId = await inserted(evolu, "item", {
		label: NonEmptyString255(label),
		price: Integer(price),
		currency: Currency.CZK,
		catalogItemId: catalogItem.id,
		unitOfMeasure: null,
		internalCode: null,
		productCodeType: null,
		productCodeValue: null,
		categoryId: null,
	});

	const tableId = await inserted(evolu, "table", {
		deviceId: device.id,
		label: NonEmptyString255(tableLabel),
		numberOfSeats: PositiveInteger(4),
	});

	await inserted(evolu, "tableCode", {
		tableId,
		code: NonEmptyString255(code),
	});

	const billId = await inserted(evolu, "posBill", {
		deviceId: device.id,
		displayId: PositiveInteger(1),
		label: null,
		currency: Currency.CZK,
		tableId,
		paymentId: null,
		closedAt: null,
	});

	await inserted(evolu, "posBillItemLine", {
		posBillId: billId,
		deviceId: device.id,
		catalogItemId: catalogItem.id,
		itemId,
		_tag: "add",
		totalAmount: Integer(price * quantity),
		quantity: PositiveNumber(quantity),
	});

	const accountId = await inserted(evolu, "account", {
		deviceId: device.id,
		name: NonEmptyString255("E2E Gateway"),
		_tag: "accountThunderBridge",
	});

	await upserted(evolu, "accountThunderBridge", {
		id: accountId,
		gatewayUrl: HttpsUrl(scenario.gateway.url),
		gatewayToken: NonEmptyString255(scenario.gateway.token),
		lud16: Email(scenario.gateway.lud16),
		iban: null,
		fioReadToken: null,
	});

	await upserted(evolu, "paymentDefaultMethod", {
		id: defaultAccountIds(mnemonic).sparkPaymentDefaultMethodId,
		type: PaymentDefaultMethodType.BtcLn,
		accountId: defaultAccountIds(mnemonic).sparkAccountId,
		pausedAt: TimestampMs(Date.now()),
	});

	await inserted(evolu, "paymentDefaultMethod", {
		type: PaymentDefaultMethodType.BtcLn,
		accountId,
		pausedAt: null,
	});

	return {
		mnemonic,
		deviceId: device.id,
		pubkey: new NDKPrivateKeySigner(privateKeyFromSeedWords(mnemonic)).pubkey,
		venueName,
		tableId,
		tableLabel,
		code,
		billId,
		itemId,
		accountId,
		item: { label, price, quantity },
	};
};
