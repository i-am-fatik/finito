import { afterEach, describe, expect, it, mock } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import type { ScreenData } from "@/lib/bill/driver";
import type { TablePaymentRequest } from "@/lib/contracts/table";
import { Currency, Integer, NonNegativeInteger } from "@/lib/shared/types";

mock.module("framer-motion", () => ({
	motion: new Proxy(
		{},
		{
			get:
				(_target, tag) =>
				({ children }: { children?: ReactNode }) =>
					createElement(typeof tag === "string" ? tag : "div", null, children),
		},
	),
}));

const { TableScreen } = await import(
	"@/app/(client)/payment/components/table-screen"
);

type TableScreenData = Extract<ScreenData, { variant: "table" }>;

const screenOf = (pay: TableScreenData["pay"]): TableScreenData => ({
	variant: "table",
	pay,
	payload: {
		bill: {
			currency: Currency.BTC,
			itemLines: [
				{
					quantity: 3,
					optionality: { checked: NonNegativeInteger(3) },
					item: { id: "beer", label: "Beer", price: Integer(21) },
				},
			],
		},
	},
});

const renderScreen = (pay: TableScreenData["pay"]) =>
	render(
		<QueryClientProvider client={new QueryClient()}>
			<TableScreen screen={screenOf(pay)} />
		</QueryClientProvider>,
	);

const payButton = () => {
	const button = screen
		.getByText("client:paymentPage.actions.pay")
		.closest("button");
	if (button === null) {
		throw new Error("pay button not rendered");
	}
	return button;
};

afterEach(cleanup);

describe("TableScreen pay button", () => {
	it("sends one request for two rapid Pay clicks", async () => {
		const requests: TablePaymentRequest[] = [];
		renderScreen((request) => {
			requests.push(request);
			return new Promise(() => {});
		});

		const button = payButton();
		fireEvent.click(button);
		fireEvent.click(button);

		await waitFor(() => expect(requests).toHaveLength(1));
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(requests).toHaveLength(1);
	});

	it("repeats the same payment id when paying again after a soft refusal", async () => {
		const requests: TablePaymentRequest[] = [];
		renderScreen(async (request) => {
			requests.push(request);
		});

		fireEvent.click(payButton());
		await waitFor(() => expect(requests).toHaveLength(1));
		fireEvent.click(payButton());
		await waitFor(() => expect(requests).toHaveLength(2));

		expect(requests[1]?.paymentId).toBe(
			requests[0]?.paymentId as TablePaymentRequest["paymentId"],
		);
	});

	it("mints under a fresh payment id once the selection changes", async () => {
		const requests: TablePaymentRequest[] = [];
		renderScreen(async (request) => {
			requests.push(request);
		});

		fireEvent.click(payButton());
		await waitFor(() => expect(requests).toHaveLength(1));

		const decrease = screen
			.getByText("components:counterCheckbox.decreaseCount")
			.closest("button");
		if (decrease === null) {
			throw new Error("decrease button not rendered");
		}
		fireEvent.click(decrease);

		fireEvent.click(payButton());
		await waitFor(() => expect(requests).toHaveLength(2));

		expect(requests[1]?.paymentId).not.toBe(requests[0]?.paymentId);
		expect(requests[1]?.items[0]?.quantity).toBe(2);
	});
});
