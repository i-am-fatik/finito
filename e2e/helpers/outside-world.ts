import type { BrowserContext } from "@playwright/test";

const servedLocally = (hostname: string) =>
	hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]";

export const refuseTheOutsideWorld = async (context: BrowserContext) => {
	await context.route("**/*", async (route) => {
		if (servedLocally(new URL(route.request().url()).hostname)) {
			await route.continue();
			return;
		}

		await route.abort("blockedbyclient");
	});
};

export const routeExchangeRate = async (
	context: BrowserContext,
	czkPerBtc: number,
) => {
	await context.route(
		"https://coinmate.io/api/ticker*",
		async (route) =>
			await route.fulfill({
				json: { data: { last: czkPerBtc } },
			}),
	);
};
