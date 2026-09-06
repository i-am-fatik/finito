import { BigNumber } from "bignumber.js";
import { universalFetch } from "@/lib/http/fetch";
import type { CurrencyConverterDriver } from "@/lib/integrations/currency-converter/currency-converter-types";
import type {
	ExchangePair,
	ExchangePreset,
} from "@/lib/integrations/currency-converter/exchange-presets";
import { Integer } from "@/lib/shared/types";
import { currencyFractionDigits } from "@/lib/shared/zod/money-codec";

const fetchPrice = async (preset: ExchangePreset, pair: ExchangePair) => {
	const url = preset.endpoint(pair);
	if (url === null) {
		return null;
	}

	try {
		const response = await universalFetch(url);
		if (!response.ok) {
			console.error(
				new Error(`${preset.label} responded with ${response.status}`),
			);
			return null;
		}

		return preset.readPrice(await response.json());
	} catch (error) {
		console.error(`Error fetching the rate from ${preset.label}:`, error);
		return null;
	}
};

export const createPresetDriver = ({
	preset,
	cacheInSeconds,
}: {
	preset: ExchangePreset;
	cacheInSeconds: number;
}): CurrencyConverterDriver => {
	const cache = new Map<string, Promise<number | null>>();

	const rateFor = async (pair: ExchangePair) => {
		const quoted = await fetchPrice(preset, pair);
		if (quoted !== null) {
			return quoted;
		}

		const inverted = await fetchPrice(preset, {
			base: pair.quote,
			quote: pair.base,
		});

		return inverted === null ? null : 1 / inverted;
	};

	const cachedRateFor = (pair: ExchangePair) => {
		const cacheKey = `${pair.base}/${pair.quote}`;
		const cached = cache.get(cacheKey);
		if (cached !== undefined) {
			return cached;
		}

		const pending = rateFor(pair);
		cache.set(cacheKey, pending);
		setTimeout(() => {
			cache.delete(cacheKey);
		}, cacheInSeconds * 1000);

		return pending;
	};

	return {
		convert: async (props) => {
			if (props.sourceCurrency === props.targetCurrency) {
				return props.amount;
			}

			const rate = await cachedRateFor({
				base: props.sourceCurrency,
				quote: props.targetCurrency,
			});
			if (rate === null) {
				return null;
			}

			return Integer(
				new BigNumber(rate)
					.times(
						new BigNumber(props.amount).shiftedBy(
							-currencyFractionDigits[props.sourceCurrency],
						),
					)
					.shiftedBy(currencyFractionDigits[props.targetCurrency])
					.integerValue()
					.toNumber(),
			);
		},
	};
};
