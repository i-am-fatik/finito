import { BigNumber } from "bignumber.js";
import type { Id } from "@/lib/evolu/types";
import {
	Integer,
	type NonEmptyString255,
	type Percent,
} from "@/lib/shared/types";

export type TaxSplit = {
	base: Integer;
	tax: Integer;
};

export type TaxedLine = {
	taxRateId: Id | null;
	totalAmount: Integer;
};

export type TaxRate = {
	id: Id;
	name: NonEmptyString255 | null;
	rate: Percent;
};

export type TaxRecapRow = {
	taxRateId: Id | null;
	name: NonEmptyString255 | null;
	rate: Percent | null;
	base: Integer;
	tax: Integer;
	gross: Integer;
};

export type TaxRecap = {
	rows: ReadonlyArray<TaxRecapRow>;
	unresolvedAmount: Integer;
};

const hundredPercent = 100;

export const splitInclusiveAmount = (
	gross: Integer,
	rate: Percent,
): TaxSplit => {
	const base = new BigNumber(gross)
		.dividedBy(new BigNumber(rate).dividedBy(hundredPercent).plus(1))
		.integerValue(BigNumber.ROUND_HALF_UP)
		.toNumber();

	return {
		base: Integer(base),
		tax: Integer(gross - base),
	};
};

export const calculateTaxRecap = (
	lines: ReadonlyArray<TaxedLine>,
	rates: ReadonlyArray<TaxRate>,
): TaxRecap => {
	const totals = new Map<Id | null, TaxSplit & { gross: number }>();
	let unresolved = 0;

	for (const line of lines) {
		const rate = rates.find((candidate) => candidate.id === line.taxRateId);
		if (line.taxRateId !== null && rate === undefined) {
			unresolved += line.totalAmount;
			continue;
		}

		const split =
			rate === undefined
				? { base: line.totalAmount, tax: Integer(0) }
				: splitInclusiveAmount(line.totalAmount, rate.rate);
		const running = totals.get(line.taxRateId) ?? {
			base: Integer(0),
			tax: Integer(0),
			gross: 0,
		};

		totals.set(line.taxRateId, {
			base: Integer(running.base + split.base),
			tax: Integer(running.tax + split.tax),
			gross: running.gross + line.totalAmount,
		});
	}

	const rows: TaxRecapRow[] = [];

	for (const rate of rates) {
		const summed = totals.get(rate.id);
		if (summed === undefined) {
			continue;
		}

		rows.push({
			taxRateId: rate.id,
			name: rate.name,
			rate: rate.rate,
			base: summed.base,
			tax: summed.tax,
			gross: Integer(summed.gross),
		});
	}

	const untaxed = totals.get(null);
	if (untaxed !== undefined) {
		rows.push({
			taxRateId: null,
			name: null,
			rate: null,
			base: untaxed.base,
			tax: untaxed.tax,
			gross: Integer(untaxed.gross),
		});
	}

	return { rows, unresolvedAmount: Integer(unresolved) };
};
