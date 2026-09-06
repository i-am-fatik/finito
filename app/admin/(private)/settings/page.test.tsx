import { describe, expect, it, mock } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import { ExchangeRateSource } from "@/lib/shared/types";
import Page from "./page";

const billingSettingsRow = {
	ownContactId: null,
	defaultCurrency: "CZK",
	defaultTimezone: "Europe/Prague",
	exchangeRateSource: ExchangeRateSource.kraken,
	defaultPaymentMethod: "Cash",
	defaultBankTransferCzKey: null,
	defaultLnZapKey: null,
	defaultLnSparkKey: null,
	rates: [],
};

mock.module("next/navigation", () => ({
	useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
	useSearchParams: () => new URLSearchParams(),
	usePathname: () => "/admin/settings",
}));

mock.module("@/hooks/use-evolu-query", () => ({
	useEvoluQuery: () => ({ data: [billingSettingsRow] }),
}));

mock.module("@/hooks/use-evolu", () => ({
	useEvolu: () => ({ upsert: () => ({ id: "" }), update: () => ({ id: "" }) }),
}));

describe("settings page", () => {
	it("shows the exchange the venue saved rather than resetting to the default", async () => {
		render(<Page />);

		await waitFor(() => {
			expect(screen.getByText("Kraken")).toBeInTheDocument();
		});
	});
});
