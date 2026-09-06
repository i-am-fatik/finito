import { describe, expect, it } from "bun:test";
import { HttpsUrlSchema, NonEmptyString255Schema } from "@/lib/shared/types";

describe("the gateway url an account may be given", () => {
	it("accepts an https url", () => {
		expect(String(HttpsUrlSchema.parse("https://gateway.invalid/api"))).toBe(
			"https://gateway.invalid/api",
		);
	});

	it("refuses plain http, which would carry the gateway token in the clear", () => {
		expect(HttpsUrlSchema.safeParse("http://gateway.invalid").success).toBe(
			false,
		);
	});

	it.each([
		"",
		"gateway.invalid",
		"ws://gateway.invalid",
		"javascript:alert(1)",
	])("refuses %p", (value) => {
		expect(HttpsUrlSchema.safeParse(value).success).toBe(false);
	});
});

describe("the gateway token an account may be given", () => {
	it("accepts a token", () => {
		expect(
			String(NonEmptyString255Schema.parse("invented-gateway-token")),
		).toBe("invented-gateway-token");
	});

	it("refuses an empty token, so a blank field cannot pass for a configured one", () => {
		expect(NonEmptyString255Schema.safeParse("").success).toBe(false);
	});

	it("refuses a token longer than the column holds", () => {
		expect(NonEmptyString255Schema.safeParse("t".repeat(255)).success).toBe(
			true,
		);
		expect(NonEmptyString255Schema.safeParse("t".repeat(256)).success).toBe(
			false,
		);
	});
});
