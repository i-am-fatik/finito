import type { Currency } from "@/lib/shared/types";

export type CatalogScenarioInput =
	| {
			name: "empty-catalog";
	  }
	| {
			name: "single-category";
			category?: {
				name?: string;
			};
	  }
	| {
			name: "single-item";
			item?: {
				label?: string;
				price?: number;
				currency?: Currency;
			};
			category?: {
				name?: string;
			};
	  };

export type TableScenarioInput = {
	venueName?: string;
	item?: {
		label?: string;
		price?: number;
		quantity?: number;
	};
	table?: {
		label?: string;
		code?: string;
	};
	gateway: {
		url: string;
		token: string;
		lud16: string;
	};
};

export type BankScenarioInput = {
	apiUrl: string;
	token: string;
	iban: string;
};

export type ZapScenarioInput = {
	lud16: string;
	lnInvoice: string;
	paymentHash: string;
	privateKey: string;
	walletPubkey: string;
	amountSats: number;
	expiresAtSec: number;
};

export type NwcScenarioInput = {
	credentials: string;
};

export type PosChargeScenarioInput = {
	item?: {
		label?: string;
		price?: number;
	};
};

export type E2EScenarioName =
	| "catalog"
	| "pos-charge"
	| "table"
	| "bank"
	| "zap"
	| "nwc";

export type E2EScenarioInputMap = {
	catalog: CatalogScenarioInput;
	"pos-charge": PosChargeScenarioInput;
	table: TableScenarioInput;
	bank: BankScenarioInput;
	zap: ZapScenarioInput;
	nwc: NwcScenarioInput;
};

export type CatalogScenarioResult = {
	mnemonic: string;
	deviceId: string;
	item?: {
		id: string;
		label: string;
	};
	category?: {
		id: string;
		name: string;
	};
};

export type PosChargeScenarioResult = {
	mnemonic: string;
	deviceId: string;
	cashAccountId: string;
	item: {
		id: string;
		label: string;
	};
};

export type TableScenarioResult = {
	mnemonic: string;
	deviceId: string;
	pubkey: string;
	venueName: string;
	tableId: string;
	tableLabel: string;
	code: string;
	billId: string;
	itemId: string;
	accountId: string;
	item: {
		label: string;
		price: number;
		quantity: number;
	};
};

export type BankScenarioResult = {
	mnemonic: string;
	deviceId: string;
	accountId: string;
	iban: string;
};

export type ZapScenarioResult = {
	mnemonic: string;
	deviceId: string;
	accountId: string;
	paymentId: string;
	watchable: number;
};

export type NwcScenarioResult = {
	mnemonic: string;
	deviceId: string;
	accountId: string;
};

export type E2EScenarioResultMap = {
	catalog: CatalogScenarioResult;
	"pos-charge": PosChargeScenarioResult;
	table: TableScenarioResult;
	bank: BankScenarioResult;
	zap: ZapScenarioResult;
	nwc: NwcScenarioResult;
};

export type E2EWorkerContext = {
	workerId: string;
	deviceKey: string;
};

export type E2EScenarioContext = E2EWorkerContext & {
	testId: string;
};

export type FinitoE2EHarness = {
	resetBrowserState: () => Promise<void>;
	bootstrap: (context: E2EWorkerContext) => Promise<{
		deviceId: string;
		mnemonic: string;
	}>;
	runScenario: <TName extends E2EScenarioName>(
		name: TName,
		input: E2EScenarioInputMap[TName],
		context: E2EScenarioContext,
	) => Promise<E2EScenarioResultMap[TName]>;
};
