import { z } from "zod";
import {
	Currency,
	Integer,
	IntegerSchema,
	NumberString,
	NumberStringSchema,
} from "@/lib/shared/types";

export type Money = {
	value: Integer;
	currency: Currency;
};

const MoneyInputSchema = z.object({
	value: NumberStringSchema,
	currency: z.enum(Currency),
});

const MoneyOutputSchema = z.object({
	value: IntegerSchema,
	currency: z.enum(Currency),
});

export const currencyFractionDigits: Record<Currency, Integer> = {
	USD: Integer(2),
	EUR: Integer(2),
	CZK: Integer(2),
	BTC: Integer(8), // We want to present BTC in sats
};

export const currencyFractionDigitsForUI: Record<Currency, Integer> = {
	USD: Integer(2),
	EUR: Integer(2),
	CZK: Integer(2),
	BTC: Integer(0), // We want to present BTC in sats
};

const parseDecimalString = (props: {
	value: string;
	fractionDigits: Integer;
}): Integer | null => {
	const normalized = props.value.trim();
	if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
		return null;
	}

	const isNegative = normalized.startsWith("-");
	const unsigned = isNegative ? normalized.slice(1) : normalized;
	const [integerPart, fractionPartRaw = ""] = unsigned.split(".");
	if (fractionPartRaw.length > props.fractionDigits) {
		return null;
	}

	const paddedFraction = fractionPartRaw.padEnd(props.fractionDigits, "0");
	const digits = `${integerPart}${paddedFraction}`.replace(/^0+(?=\d)/, "");
	const minorUnits = Integer(digits === "" ? 0 : Number(digits));
	return isNegative ? Integer(-minorUnits) : minorUnits;
};

export const decimalStringToMinorUnits = (props: {
	value: string;
	currency: Currency;
}): Integer | null =>
	parseDecimalString({
		value: props.value,
		fractionDigits: currencyFractionDigits[props.currency],
	});

export const decimalStringToMinorUnitsForUI = (props: {
	value: string;
	currency: Currency;
}): Integer | null =>
	parseDecimalString({
		value: props.value,
		fractionDigits: currencyFractionDigitsForUI[props.currency],
	});

const renderDecimalString = (props: {
	value: Integer;
	fractionDigits: Integer;
}): string => {
	const isNegative = props.value < 0;
	const abs = isNegative ? -props.value : props.value;

	if (props.fractionDigits === 0) {
		const result = abs.toString();
		return isNegative && result !== "0" ? `-${result}` : result;
	}

	const text = abs.toString().padStart(props.fractionDigits + 1, "0");
	const integerPart = text
		.slice(0, -props.fractionDigits)
		.replace(/^0+(?=\d)/, "");
	const fractionPart = text.slice(-props.fractionDigits).replace(/0+$/, "");
	const base =
		fractionPart === "" ? integerPart : `${integerPart}.${fractionPart}`;

	return isNegative && base !== "0" ? `-${base}` : base;
};

export const minorUnitsToDecimalString = (props: Money): NumberString =>
	NumberString(
		renderDecimalString({
			value: props.value,
			fractionDigits: currencyFractionDigits[props.currency],
		}),
	);

export const minorUnitsToDecimalStringForUI = (props: Money): string =>
	renderDecimalString({
		value: props.value,
		fractionDigits: currencyFractionDigitsForUI[props.currency],
	});

export const moneyCodec = z.codec(MoneyInputSchema, MoneyOutputSchema, {
	decode: (input, ctx) => {
		const minorUnits = decimalStringToMinorUnits({
			value: input.value,
			currency: input.currency,
		});

		if (minorUnits === null) {
			ctx.issues.push({
				code: "custom",
				input,
				message: `Invalid money value for ${input.currency}.`,
			});
			return z.NEVER;
		}

		return {
			value: minorUnits,
			currency: input.currency,
		};
	},
	encode: (output) => {
		return {
			value: minorUnitsToDecimalString({
				value: output.value,
				currency: output.currency,
			}),
			currency: output.currency,
		};
	},
});
