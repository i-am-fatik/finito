import { expect, type Page } from "@playwright/test";
import type {
	E2EScenarioContext,
	E2EWorkerContext,
	E2EScenarioInputMap,
	E2EScenarioName,
	E2EScenarioResultMap,
} from "@/lib/testing/e2e-types";

export const openHarness = async (page: Page) => {
	await page.goto("/e2e");
	await expect(page.getByTestId("e2e-status")).toHaveText("status:ready", {
		timeout: 60_000,
	});
};

export const resetBrowserState = async (page: Page) => {
	await openHarness(page);

	await page.evaluate(async () => {
		if (!window.__finitoE2E) {
			throw new Error("E2E harness is not available.");
		}

		await window.__finitoE2E.resetBrowserState();
	});
};

export const bootstrapE2EAuth = async (
	page: Page,
	context: E2EWorkerContext,
) => {
	await resetBrowserState(page);

	return await page.evaluate(
		async (workerContext) => {
			if (!window.__finitoE2E) {
				throw new Error("E2E harness is not available.");
			}

			return await window.__finitoE2E.bootstrap(workerContext);
		},
		context,
	);
};

export const runScenario = async <TName extends E2EScenarioName>(
	page: Page,
	name: TName,
	input: E2EScenarioInputMap[TName],
	context: E2EScenarioContext,
): Promise<E2EScenarioResultMap[TName]> => {
	await resetBrowserState(page);

	const result: unknown = await page.evaluate(
		async (params: {
			scenarioName: E2EScenarioName;
			scenarioInput: E2EScenarioInputMap[E2EScenarioName];
			scenarioContext: E2EScenarioContext;
		}) => {
			if (!window.__finitoE2E) {
				throw new Error("E2E harness is not available.");
			}

			return await window.__finitoE2E.runScenario(
				params.scenarioName,
				params.scenarioInput as never,
				params.scenarioContext,
			);
		},
		{
			scenarioName: name,
			scenarioInput: input,
			scenarioContext: context,
		},
	);

	return result as E2EScenarioResultMap[TName];
};
