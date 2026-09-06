import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { cleanup, renderHook } from "@testing-library/react";
import { atom } from "jotai";
import { Currency, Integer } from "@/lib/shared/types";

let charged: Array<Record<string, unknown>> = [];
let errors: string[] = [];

mock.module("@/hooks/use-bill", () => ({
	useBill: () => ({
		chargeBill: (params: Record<string, unknown>) => {
			charged.push(params);
		},
		cancelCharge: () => {},
	}),
}));

mock.module("@/hooks/use-evolu", () => ({
	useEvolu: () => ({}),
}));

mock.module("@/hooks/use-nostr", () => ({
	useNostr: () => ({ ndk: {} }),
}));

mock.module("@/atoms/account", () => ({
	accountAtom: atom({ device: { id: "device-1" } }),
}));

mock.module("sonner", () => ({
	toast: Object.assign(() => 1, {
		error: (message: string) => {
			errors.push(message);
			return 1;
		},
	}),
}));

const { useChargeBill } = await import("@/hooks/use-charge-bill");

const originalConsoleError = console.error;

beforeEach(() => {
	charged = [];
	errors = [];
	console.error = () => {};
});

afterEach(() => {
	cleanup();
	console.error = originalConsoleError;
});

describe("useChargeBill", () => {
	it("tells the till when the payment could not be minted and links nothing", async () => {
		const { result } = renderHook(() => useChargeBill());

		const paymentId = await result.current.charge({
			billId: "bill-1" as never,
			currency: Currency.BTC,
			total: Integer(2100),
			items: [],
		});

		expect(paymentId).toBeUndefined();
		expect(charged).toEqual([]);
		expect(errors).toEqual(["pos:bill.charge.failed"]);
	});
});
