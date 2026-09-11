import { mkdir } from "node:fs/promises";
import path from "node:path";
import {
	type BrowserContext,
	expect,
	type Page,
	test as base,
} from "@playwright/test";

import type {
	CatalogScenarioInput,
	CatalogScenarioResult,
	E2EScenarioContext,
	E2EWorkerContext,
} from "@/lib/testing/e2e-types";
import { baseURL } from "../playwright.config";
import {
	bootstrapE2EAuth,
	resetBrowserState,
	runScenario,
} from "./helpers/harness";
import { type FakeFioBank, fakeFioBank } from "./helpers/fio-bank";
import {
	type FakeLightningGateway,
	fakeLightningGateway,
} from "./helpers/lightning-gateway";
import { type NostrRelay, nostrRelayAt } from "./helpers/nostr-relay";
import { type NwcWallet, nwcWalletOn } from "./helpers/nwc-wallet";
import {
	refuseTheOutsideWorld,
	routeExchangeRate,
} from "./helpers/outside-world";

export const czkPerBtc = 2_000_000;

type World = {
	relay: NostrRelay;
	gateway: FakeLightningGateway;
	bank: FakeFioBank;
};

const hermetic = async (context: BrowserContext, world: World) => {
	await refuseTheOutsideWorld(context);
	await routeExchangeRate(context, czkPerBtc);
	await world.gateway.serve(context);
	await world.bank.serve(context);
	await world.relay.serve(
		context,
		(url) =>
			url.hostname !== "127.0.0.1" &&
			url.host !== new URL(world.gateway.url).host,
	);
};

type E2EWorkerFixtures = {
	workerContext: E2EWorkerContext;
	workerStorageState: string;
};

type E2ETestFixtures = {
	scenarioContext: E2EScenarioContext;
	relay: NostrRelay;
	gateway: FakeLightningGateway;
	bank: FakeFioBank;
	wallet: NwcWallet;
	guest: Page;
	harness: {
		resetBrowserState: () => Promise<void>;
		bootstrapAuth: () => Promise<{
			deviceId: string;
			mnemonic: string;
		}>;
		runScenario: <
			TName extends keyof import("@/lib/testing/e2e-types").E2EScenarioInputMap,
		>(
			name: TName,
			input: import("@/lib/testing/e2e-types").E2EScenarioInputMap[TName],
		) => Promise<
			import("@/lib/testing/e2e-types").E2EScenarioResultMap[TName]
		>;
		seedCatalog: (
			input: CatalogScenarioInput,
		) => Promise<CatalogScenarioResult>;
		page: Page;
	};
};

export const test = base.extend<E2ETestFixtures, E2EWorkerFixtures>({
	workerContext: [
		async ({}, use, workerInfo) => {
			await use({
				workerId: `worker-${workerInfo.parallelIndex}`,
				deviceKey: `e2e-device-${workerInfo.parallelIndex}`,
			});
		},
		{ scope: "worker" },
	],
	workerStorageState: [
		async ({ browser, workerContext }, use, workerInfo) => {
			const authDir = path.join("e2e", ".auth");
			const authFile = path.join(
				authDir,
				`admin-${workerInfo.parallelIndex}.json`,
			);
			await mkdir(authDir, { recursive: true });

			const context = await browser.newContext({
				baseURL,
			});
			await hermetic(context, {
				relay: nostrRelayAt(),
				gateway: fakeLightningGateway(),
				bank: fakeFioBank(),
			});
			const page = await context.newPage();
			await bootstrapE2EAuth(page, workerContext);
			await context.storageState({
				path: authFile,
				indexedDB: true,
			});
			await context.close();

			await use(authFile);
		},
		{ scope: "worker" },
	],
	storageState: async ({ workerStorageState }, use) => {
		await use(workerStorageState);
	},
	relay: async ({}, use) => {
		await use(nostrRelayAt());
	},
	gateway: async ({}, use) => {
		await use(fakeLightningGateway());
	},
	bank: async ({}, use) => {
		await use(fakeFioBank());
	},
	wallet: async ({}, use) => {
		const wallet = nwcWalletOn();
		await wallet.open();

		await use(wallet);

		wallet.close();
	},
	context: async ({ context, relay, gateway, bank }, use) => {
		await hermetic(context, { relay, gateway, bank });
		await use(context);
	},
	guest: async ({ browser, relay, gateway, bank }, use) => {
		const context = await browser.newContext({ baseURL });
		await hermetic(context, { relay, gateway, bank });
		const page = await context.newPage();

		await use(page);

		await context.close();
	},
	scenarioContext: async ({ workerContext }, use, testInfo) => {
		await use({
			...workerContext,
			testId: testInfo.testId,
		});
	},
	harness: async ({ page, scenarioContext, workerContext }, use) => {
		await use({
			page,
			resetBrowserState: async () => {
				await resetBrowserState(page);
			},
			bootstrapAuth: async () => {
				return await bootstrapE2EAuth(page, workerContext);
			},
			runScenario: async (name, input) =>
				await runScenario(page, name, input, scenarioContext),
			seedCatalog: async (input) =>
				await runScenario(page, "catalog", input, scenarioContext),
		});
	},
});

export { expect };
