import { describe, expect, it } from "bun:test";
import {
	assertNever,
	assertNotNull,
	assertNotUndefined,
} from "@/lib/shared/utils/type";

describe("assertNotNull", () => {
	it("rejects null", () => {
		expect(() => assertNotNull(null)).toThrow("Value must not be null");
	});

	it("lets a value through", () => {
		expect(() => assertNotNull(0)).not.toThrow();
		expect(() => assertNotNull("")).not.toThrow();
	});
});

describe("assertNotUndefined", () => {
	it("lets a value through", () => {
		expect(() => assertNotUndefined(0)).not.toThrow();
		expect(() => assertNotUndefined("")).not.toThrow();
	});

	it("lets undefined through, because it tests for null instead", () => {
		expect(() => assertNotUndefined(undefined)).not.toThrow();
		expect(() => assertNotUndefined(null)).toThrow(
			"Value must not be undefined",
		);
	});
});

describe("assertNever", () => {
	it("names the value nobody expected", () => {
		expect(() => assertNever("lnBridge" as never)).toThrow(
			'Unexpected value: "lnBridge"',
		);
	});
});
