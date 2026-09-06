import { describe, expect, it } from "bun:test";
import { Currency, Integer, NumberString } from "@/lib/shared/types";
import {
	decimalStringToMinorUnits,
	decimalStringToMinorUnitsForUI,
	minorUnitsToDecimalString,
	minorUnitsToDecimalStringForUI,
} from "@/lib/shared/zod/money-codec";

describe("money codec", () => {
	it("keeps BTC in bitcoin for storage units", () => {
		expect(
			decimalStringToMinorUnits({
				value: "0.00000115",
				currency: Currency.BTC,
			}),
		).toBe(Integer(115));
		expect(
			minorUnitsToDecimalString({
				value: Integer(115),
				currency: Currency.BTC,
			}),
		).toBe(NumberString("0.00000115"));
	});

	it("reads and writes BTC in sats for display units", () => {
		expect(
			decimalStringToMinorUnitsForUI({ value: "115", currency: Currency.BTC }),
		).toBe(Integer(115));
		expect(
			minorUnitsToDecimalStringForUI({
				value: Integer(115),
				currency: Currency.BTC,
			}),
		).toBe("115");
	});

	it("rejects a fractional sat", () => {
		expect(
			decimalStringToMinorUnitsForUI({ value: "1.5", currency: Currency.BTC }),
		).toBeNull();
	});

	it("treats fiat the same in both unit systems", () => {
		expect(
			decimalStringToMinorUnitsForUI({
				value: "49.90",
				currency: Currency.CZK,
			}),
		).toBe(Integer(4990));
		expect(
			minorUnitsToDecimalStringForUI({
				value: Integer(4990),
				currency: Currency.CZK,
			}),
		).toBe("49.9");
	});

	it("keeps the sign of a negative amount", () => {
		expect(
			minorUnitsToDecimalStringForUI({
				value: Integer(-115),
				currency: Currency.BTC,
			}),
		).toBe("-115");
		expect(
			minorUnitsToDecimalString({
				value: Integer(-4990),
				currency: Currency.CZK,
			}),
		).toBe(NumberString("-49.9"));
	});

});
