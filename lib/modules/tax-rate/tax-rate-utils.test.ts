import { describe, expect, it } from "bun:test";
import { createIdFromString } from "@evolu/common";
import {
	calculateTaxRecap,
	splitInclusiveAmount,
	type TaxRate,
} from "@/lib/modules/tax-rate/tax-rate-utils";
import { Integer, NonEmptyString255, Percent } from "@/lib/shared/types";

const standardId = createIdFromString("taxRateStandard");
const reducedId = createIdFromString("taxRateReduced");

const standard: TaxRate = {
	id: standardId,
	name: NonEmptyString255("Standard"),
	rate: Percent(21),
};

const reduced: TaxRate = {
	id: reducedId,
	name: NonEmptyString255("Reduced"),
	rate: Percent(12),
};

describe("splitInclusiveAmount", () => {
	it("takes the tax out of a price that already carries it", () => {
		expect(splitInclusiveAmount(Integer(12_100), Percent(21))).toEqual({
			base: Integer(10_000),
			tax: Integer(2_100),
		});
	});

	it("leaves the whole amount as the base at zero percent", () => {
		expect(splitInclusiveAmount(Integer(4_500), Percent(0))).toEqual({
			base: Integer(4_500),
			tax: Integer(0),
		});
	});

	it("rounds the base half up and gives the rest to the tax", () => {
		expect(splitInclusiveAmount(Integer(3), Percent(21))).toEqual({
			base: Integer(2),
			tax: Integer(1),
		});
	});
});

describe("calculateTaxRecap", () => {
	it("rounds every line before summing, never the sum once", () => {
		const perLine = calculateTaxRecap(
			[
				{ taxRateId: standardId, totalAmount: Integer(3) },
				{ taxRateId: standardId, totalAmount: Integer(3) },
			],
			[standard],
		);

		expect(perLine.rows[0]).toMatchObject({
			base: Integer(4),
			tax: Integer(2),
			gross: Integer(6),
		});
		expect(splitInclusiveAmount(Integer(6), Percent(21))).toEqual({
			base: Integer(5),
			tax: Integer(1),
		});
	});

	it("keeps one row per rate, in the order the rates were given", () => {
		const recap = calculateTaxRecap(
			[
				{ taxRateId: reducedId, totalAmount: Integer(1_120) },
				{ taxRateId: standardId, totalAmount: Integer(12_100) },
			],
			[standard, reduced],
		);

		expect(recap.rows.map((row) => row.name)).toEqual([
			NonEmptyString255("Standard"),
			NonEmptyString255("Reduced"),
		]);
		expect(recap.rows[1]).toMatchObject({
			base: Integer(1_000),
			tax: Integer(120),
		});
	});

	it("leaves out a rate nothing on the document carries", () => {
		const recap = calculateTaxRecap(
			[{ taxRateId: standardId, totalAmount: Integer(12_100) }],
			[standard, reduced],
		);

		expect(recap.rows).toHaveLength(1);
	});

	it("groups the lines that carry no rate and taxes them at nothing", () => {
		const recap = calculateTaxRecap(
			[
				{ taxRateId: null, totalAmount: Integer(5_000) },
				{ taxRateId: standardId, totalAmount: Integer(12_100) },
			],
			[standard],
		);

		expect(recap.rows.at(-1)).toEqual({
			taxRateId: null,
			name: null,
			rate: null,
			base: Integer(5_000),
			tax: Integer(0),
			gross: Integer(5_000),
		});
	});

	it("reports what it could not place instead of taxing it at nothing", () => {
		const recap = calculateTaxRecap(
			[
				{ taxRateId: reducedId, totalAmount: Integer(1_120) },
				{ taxRateId: standardId, totalAmount: Integer(12_100) },
			],
			[standard],
		);

		expect(recap.unresolvedAmount).toBe(Integer(1_120));
		expect(recap.rows).toHaveLength(1);
	});
});
