import { z } from "zod";
import { Currency, ExchangeRateSource } from "@/lib/shared/types";

export type ExchangePair = {
	base: Currency;
	quote: Currency;
};

export type ExchangePreset = {
	id: ExchangeRateSource;
	label: string;
	endpoint: (pair: ExchangePair) => string | null;
	readPrice: (payload: unknown) => number | null;
};

const bitcoinPricedIn =
	(quotes: ReadonlyArray<Currency>, url: (quote: Currency) => string) =>
	(pair: ExchangePair) =>
		pair.base === Currency.BTC && quotes.includes(pair.quote)
			? url(pair.quote)
			: null;

const readWith =
	<TPayload>(
		schema: z.ZodType<TPayload>,
		pick: (payload: TPayload) => string | number,
	) =>
	(payload: unknown) => {
		const parsed = schema.safeParse(payload);
		if (!parsed.success) {
			return null;
		}

		const price = Number(pick(parsed.data));
		return Number.isFinite(price) && price > 0 ? price : null;
	};

const coinmate: ExchangePreset = {
	id: ExchangeRateSource.coinmate,
	label: "Coinmate",
	endpoint: bitcoinPricedIn(
		[Currency.CZK, Currency.EUR],
		(quote) => `https://coinmate.io/api/ticker?currencyPair=BTC_${quote}`,
	),
	readPrice: readWith(
		z.object({ data: z.object({ last: z.number() }) }),
		(payload) => payload.data.last,
	),
};

const coinbase: ExchangePreset = {
	id: ExchangeRateSource.coinbase,
	label: "Coinbase",
	endpoint: bitcoinPricedIn(
		[Currency.CZK, Currency.EUR, Currency.USD],
		(quote) => `https://api.coinbase.com/v2/prices/BTC-${quote}/spot`,
	),
	readPrice: readWith(
		z.object({ data: z.object({ amount: z.string() }) }),
		(payload) => payload.data.amount,
	),
};

const kraken: ExchangePreset = {
	id: ExchangeRateSource.kraken,
	label: "Kraken",
	endpoint: bitcoinPricedIn(
		[Currency.EUR, Currency.USD],
		(quote) => `https://api.kraken.com/0/public/Ticker?pair=XBT${quote}`,
	),
	readPrice: readWith(
		z.object({
			result: z.record(
				z.string(),
				z.object({ c: z.array(z.string()).nonempty() }),
			),
		}),
		(payload) => Object.values(payload.result)[0]?.c[0] ?? "",
	),
};

const bitstamp: ExchangePreset = {
	id: ExchangeRateSource.bitstamp,
	label: "Bitstamp",
	endpoint: bitcoinPricedIn(
		[Currency.EUR, Currency.USD],
		(quote) =>
			`https://www.bitstamp.net/api/v2/ticker/btc${quote.toLowerCase()}/`,
	),
	readPrice: readWith(
		z.object({ last: z.string() }),
		(payload) => payload.last,
	),
};

const binance: ExchangePreset = {
	id: ExchangeRateSource.binance,
	label: "Binance",
	endpoint: bitcoinPricedIn(
		[Currency.EUR],
		(quote) => `https://api.binance.com/api/v3/ticker/price?symbol=BTC${quote}`,
	),
	readPrice: readWith(
		z.object({ price: z.string() }),
		(payload) => payload.price,
	),
};

const yadio: ExchangePreset = {
	id: ExchangeRateSource.yadio,
	label: "Yadio",
	endpoint: (pair) =>
		`https://api.yadio.io/convert/1/${pair.base}/${pair.quote}`,
	readPrice: readWith(
		z.object({ result: z.number() }),
		(payload) => payload.result,
	),
};

export const exchangePresets: ReadonlyArray<ExchangePreset> = [
	coinmate,
	coinbase,
	kraken,
	bitstamp,
	binance,
	yadio,
];

export const exchangePresetLabels = Object.fromEntries(
	exchangePresets.map((preset) => [preset.id, preset.label]),
) as Record<ExchangeRateSource, string>;
