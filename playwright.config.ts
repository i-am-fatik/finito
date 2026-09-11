import { defineConfig, devices } from "@playwright/test";
import { relayPort } from "./e2e/helpers/nostr-relay";

const port = 3000;
const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL;
const baseURL = externalBaseURL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
	testDir: "./e2e",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	workers: 2,
	retries: process.env.CI ? 2 : 0,
	reporter: [["list"], ["html", { open: "never" }]],
	use: {
		baseURL,
		trace: "on-first-retry",
		screenshot: "only-on-failure",
		video: "retain-on-failure",
	},
	projects: [
		{
			name: "chromium",
			use: {
				...devices["Desktop Chrome"],
			},
		},
	],
	webServer: [
		{
			command: "bun run e2e:relay",
			url: `http://127.0.0.1:${relayPort}`,
			reuseExistingServer: true,
			timeout: 120_000,
		},
		...(externalBaseURL
			? []
			: [
					{
						command: "bun run e2e:serve",
						url: baseURL,
						reuseExistingServer: !process.env.CI,
						timeout: 240_000,
					},
				]),
	],
});

export { baseURL };
