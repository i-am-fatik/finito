import type { CurrencyConverterDriver } from "@/lib/integrations/currency-converter/currency-converter-types";
import { exchangePresets } from "@/lib/integrations/currency-converter/exchange-presets";
import { createPresetDriver } from "@/lib/integrations/currency-converter/preset-driver";
import { ExchangeRateSource, type Integer } from "@/lib/shared/types";

export const defaultExchangeRateSource = ExchangeRateSource.coinmate;

const drivers = new Map<ExchangeRateSource, CurrencyConverterDriver>(
	exchangePresets.map((preset) => [
		preset.id,
		createPresetDriver({ preset, cacheInSeconds: 20 }),
	]),
);

let preferredSource: ExchangeRateSource = defaultExchangeRateSource;

export const setPreferredExchangeRateSource = (
	source: ExchangeRateSource | null,
) => {
	preferredSource = source ?? defaultExchangeRateSource;
};

const driversInPreferredOrder = () => {
	const preferred = drivers.get(preferredSource);
	const rest = [...drivers.entries()]
		.filter(([source]) => source !== preferredSource)
		.map(([, driver]) => driver);

	return preferred === undefined ? rest : [preferred, ...rest];
};

export const currencyConverter = {
	convert: async (
		props: Parameters<CurrencyConverterDriver["convert"]>[0],
	): Promise<Integer | null> => {
		for (const driver of driversInPreferredOrder()) {
			const result = await driver.convert(props);
			if (result !== null) {
				return result;
			}
		}

		return null;
	},
};
