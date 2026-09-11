import { describe, expect, it } from "bun:test";
import { createIdFromString } from "@evolu/common";
import { variableSymbolForPayment } from "@/lib/payment/variable-symbol";

const paymentIds = Array.from({ length: 500 }, (_, index) =>
	createIdFromString(`payment:${index}`),
);

describe("variableSymbolForPayment", () => {
	it("answers the same symbol every time for one payment", () => {
		const paymentId = createIdFromString("repeatablePayment");

		expect(variableSymbolForPayment(paymentId)).toBe(
			variableSymbolForPayment(paymentId),
		);
	});

	it("tells two payments apart", () => {
		expect(variableSymbolForPayment(createIdFromString("first"))).not.toBe(
			variableSymbolForPayment(createIdFromString("second")),
		);
	});

	it("stays inside what a Czech variable symbol allows", () => {
		for (const paymentId of paymentIds) {
			expect(variableSymbolForPayment(paymentId)).toMatch(/^[0-9]{1,10}$/);
		}
	});

	it("keeps five hundred payments on five hundred symbols", () => {
		const symbols = new Set(paymentIds.map(variableSymbolForPayment));

		expect(symbols.size).toBe(paymentIds.length);
	});
});
