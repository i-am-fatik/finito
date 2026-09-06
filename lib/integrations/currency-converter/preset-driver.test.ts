import { afterEach, describe, expect, it, mock } from "bun:test";
import {
	type ExchangePreset,
	exchangePresets,
} from "@/lib/integrations/currency-converter/exchange-presets";
import { createPresetDriver } from "@/lib/integrations/currency-converter/preset-driver";
import { Currency, ExchangeRateSource, Integer } from "@/lib/shared/types";

mock.module("@/lib/http/fetch", () => ({
	universalFetch: (...args: Parameters<typeof fetch>) => fetch(...args),
}));

const originalFetch = globalThis.fetch;

const respondWith = (payloadFor: (url: string) => unknown | undefined) => {
	globalThis.fetch = (async (input: string | URL | Request) => {
		const url = input.toString();
		const payload = payloadFor(url);

		return payload === undefined
			? new Response("not found", { status: 404 })
			: Response.json(payload);
	}) as typeof fetch;
};

const presetOf = (id: ExchangeRateSource) =>
	exchangePresets.find((preset) => preset.id === id) as ExchangePreset;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("createPresetDriver", () => {
	it("inverts a bitcoin ticker to price a fiat amount in sats", async () => {
		respondWith((url) =>
			url.includes("BTC_CZK") ? { data: { last: 2_000_000 } } : undefined,
		);
		const driver = createPresetDriver({
			preset: presetOf(ExchangeRateSource.coinmate),
			cacheInSeconds: 20,
		});

		expect(
			await driver.convert({
				amount: Integer(100),
				sourceCurrency: Currency.CZK,
				targetCurrency: Currency.BTC,
			}),
		).toBe(Integer(50));
	});

	it("prices a bitcoin amount in the fiat the ticker quotes", async () => {
		respondWith((url) =>
			url.includes("BTC_CZK") ? { data: { last: 2_000_000 } } : undefined,
		);
		const driver = createPresetDriver({
			preset: presetOf(ExchangeRateSource.coinmate),
			cacheInSeconds: 20,
		});

		expect(
			await driver.convert({
				amount: Integer(50),
				sourceCurrency: Currency.BTC,
				targetCurrency: Currency.CZK,
			}),
		).toBe(Integer(100));
	});

	it("declines a pair the exchange does not quote instead of guessing", async () => {
		respondWith(() => ({ data: { last: 2_000_000 } }));
		const driver = createPresetDriver({
			preset: presetOf(ExchangeRateSource.coinmate),
			cacheInSeconds: 20,
		});

		expect(
			await driver.convert({
				amount: Integer(100),
				sourceCurrency: Currency.USD,
				targetCurrency: Currency.BTC,
			}),
		).toBeNull();
	});

	it("declines a payload it cannot read instead of returning a broken rate", async () => {
		respondWith(() => ({ data: { last: "unavailable" } }));
		const driver = createPresetDriver({
			preset: presetOf(ExchangeRateSource.coinmate),
			cacheInSeconds: 20,
		});

		expect(
			await driver.convert({
				amount: Integer(100),
				sourceCurrency: Currency.CZK,
				targetCurrency: Currency.BTC,
			}),
		).toBeNull();
	});

	it("asks the exchange once while the rate is cached", async () => {
		let calls = 0;
		respondWith((url) => {
			if (!url.includes("BTC_CZK")) {
				return undefined;
			}
			calls += 1;

			return { data: { last: 2_000_000 } };
		});
		const driver = createPresetDriver({
			preset: presetOf(ExchangeRateSource.coinmate),
			cacheInSeconds: 20,
		});
		const convert = () =>
			driver.convert({
				amount: Integer(100),
				sourceCurrency: Currency.CZK,
				targetCurrency: Currency.BTC,
			});

		await convert();
		await convert();

		expect(calls).toBe(1);
	});
});

describe("exchangePresets", () => {
	it("quotes every pair through a bitcoin ticker or a direct conversion", () => {
		const quoted = exchangePresets.map((preset) => [
			preset.id,
			preset.endpoint({ base: Currency.BTC, quote: Currency.CZK }) !== null,
			preset.endpoint({ base: Currency.BTC, quote: Currency.USD }) !== null,
		]);

		expect(quoted).toEqual([
			[ExchangeRateSource.coinmate, true, false],
			[ExchangeRateSource.coinbase, true, true],
			[ExchangeRateSource.kraken, false, true],
			[ExchangeRateSource.bitstamp, false, true],
			[ExchangeRateSource.binance, false, false],
			[ExchangeRateSource.yadio, true, true],
		]);
	});
});
