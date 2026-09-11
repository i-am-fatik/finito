import type { DeviceEvolu } from "@/lib/evolu/device";
import { runBankScenario } from "@/lib/testing/e2e-bank";
import { runCatalogScenario } from "@/lib/testing/e2e-catalog";
import { runNwcScenario } from "@/lib/testing/e2e-nwc";
import { runPosChargeScenario } from "@/lib/testing/e2e-pos";
import { runTableScenario } from "@/lib/testing/e2e-table";
import type {
	BankScenarioInput,
	BankScenarioResult,
	CatalogScenarioInput,
	CatalogScenarioResult,
	E2EScenarioInputMap,
	E2EScenarioName,
	E2EScenarioResultMap,
	E2EWorkerContext,
	NwcScenarioInput,
	NwcScenarioResult,
	PosChargeScenarioInput,
	PosChargeScenarioResult,
	TableScenarioInput,
	TableScenarioResult,
	ZapScenarioInput,
	ZapScenarioResult,
} from "@/lib/testing/e2e-types";
import { runZapScenario } from "@/lib/testing/e2e-zap";

type ScenarioRunner<TInput, TResult> = (
	deviceEvolu: DeviceEvolu,
	input: TInput,
	context: E2EWorkerContext,
) => Promise<TResult>;

const scenarioRegistry: {
	[K in E2EScenarioName]: ScenarioRunner<
		E2EScenarioInputMap[K],
		E2EScenarioResultMap[K]
	>;
} = {
	catalog: runCatalogScenario as ScenarioRunner<
		CatalogScenarioInput,
		CatalogScenarioResult
	>,
	"pos-charge": runPosChargeScenario as ScenarioRunner<
		PosChargeScenarioInput,
		PosChargeScenarioResult
	>,
	table: runTableScenario as ScenarioRunner<
		TableScenarioInput,
		TableScenarioResult
	>,
	bank: runBankScenario as ScenarioRunner<
		BankScenarioInput,
		BankScenarioResult
	>,
	zap: runZapScenario as ScenarioRunner<ZapScenarioInput, ZapScenarioResult>,
	nwc: runNwcScenario as ScenarioRunner<NwcScenarioInput, NwcScenarioResult>,
};

export const runE2EScenario = <TName extends E2EScenarioName>(
	deviceEvolu: DeviceEvolu,
	name: TName,
	input: E2EScenarioInputMap[TName],
	context: E2EWorkerContext,
): Promise<E2EScenarioResultMap[TName]> => {
	return scenarioRegistry[name](deviceEvolu, input, context);
};
