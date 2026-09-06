import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { createIdFromString } from "@evolu/common";
import * as ndk from "@nostr-dev-kit/ndk";
import { PaymentDefaultMethodType } from "@/lib/evolu/model/payment-default-method";
import type { NdkDep } from "@/lib/shared/dependencies";
import { Currency, NonNegativeInteger } from "@/lib/shared/types";
import { testLightningInvoice } from "@/lib/test-support/bolt11";
import { type EvoluRow, setupEvolu, writesTo } from "@/lib/test-support/evolu";
import { thunderBridgeModuleWith } from "@/lib/test-support/thunder-bridge";

const realNdkModule = { ...ndk };

const accountId = createIdFromString("bridgeAccount");
const paymentId = createIdFromString("bridgePayment");
const gatewayUrl = "https://gateway.invalid";
const gatewayToken = "invented-gateway-token";
const gatewayPaymentId = "invented-gateway-payment-id";
const lud16 = "merchant@wallet.invalid";
const amountSats = 600;

const bridgeInvoice = testLightningInvoice({
	amountSats,
	createdAtSec: 1_700_000_000,
	expirySeconds: 3600,
	preimageSeed: "bridge invoice",
});

const zapInvoice = testLightningInvoice({
	amountSats,
	createdAtSec: 1_700_000_100,
	expirySeconds: 600,
	preimageSeed: "zap invoice",
});

type GatewayConstruction = {
	url: string;
	options: { token?: string; verify?: boolean };
};

type GatewayCreatePaymentParams = {
	lnAddresses: string[];
	amountMsat: number;
};

let gatewayConstructions: GatewayConstruction[] = [];
let gatewayCreatePaymentParams: GatewayCreatePaymentParams[] = [];
let gatewayRefusal: Error | null = null;

class FakeThunderBridge {
	constructor(url: string, options: GatewayConstruction["options"]) {
		gatewayConstructions.push({ url, options });
	}

	createPayment(params: GatewayCreatePaymentParams) {
		gatewayCreatePaymentParams.push(params);

		return gatewayRefusal === null
			? Promise.resolve({
					id: gatewayPaymentId,
					bolt11: bridgeInvoice.lnInvoice,
				})
			: Promise.reject(gatewayRefusal);
	}
}

class FakeNdkEvent {
	id = "invented-event-id";

	constructor(
		_ndk: unknown,
		private readonly event: Record<string, unknown>,
	) {}

	sign() {
		return Promise.resolve("invented-signature");
	}

	toNostrEvent() {
		return Promise.resolve({ ...this.event, id: this.id });
	}

	publish() {
		return Promise.resolve(new Set());
	}
}

class FakeNdk {
	explicitRelayUrls: string[];
	signer: unknown;
	activeUser = { pubkey: "invented-pubkey" };

	constructor(options: { explicitRelayUrls?: string[]; signer?: unknown }) {
		this.explicitRelayUrls = options.explicitRelayUrls ?? [];
		this.signer = options.signer;
	}

	connect() {
		return Promise.resolve();
	}
}

mock.module("thunder-bridge", thunderBridgeModuleWith(FakeThunderBridge));

mock.module("@nostr-dev-kit/ndk", () => ({
	...realNdkModule,
	default: FakeNdk,
	NDKEvent: FakeNdkEvent,
	NDKPrivateKeySigner: {
		generate: () => ({ privateKey: "invented-private-key" }),
	},
}));

const { createPaymentWithDefaultMethods } = await import(
	"@/lib/payment/service"
);

const lud16DefaultMethod = (accountLud16GatewayUrl: string | null) => ({
	id: createIdFromString("defaultMethod"),
	type: PaymentDefaultMethodType.BtcLn,
	accountId,
	pausedAt: null,
	accountName: "Wallet through gateway",
	accountTag: "accountLud16",
	accountIban: null,
	accountLud16: lud16,
	accountLud16GatewayUrl,
});

const setupPayment = (params: {
	gatewayUrl: string | null;
	bridgeAccountRows?: EvoluRow[];
	tipAmount?: number | null;
	amountInBtc?: number | null;
}) => {
	const bridgeAccountRows: EvoluRow[] = params.bridgeAccountRows ?? [
		{
			_tag: "accountLud16",
			lud16,
			gatewayUrl: params.gatewayUrl,
			gatewayToken,
		},
	];

	const evoluFake = setupEvolu({
		rowsFor: (query) => {
			if (query.includes("paymentDefaultMethod")) {
				return [lud16DefaultMethod(params.gatewayUrl)];
			}
			if (query.includes("gatewayToken")) {
				return bridgeAccountRows;
			}
			if (query.includes("accountLud16")) {
				return [{ lud16 }];
			}
			return [];
		},
	});

	const run = () =>
		createPaymentWithDefaultMethods({
			evolu: evoluFake.evolu,
			ndk: new FakeNdk({
				explicitRelayUrls: ["wss://relay.invalid"],
			}) as unknown as NdkDep["ndk"],
		})({
			payment: {
				id: paymentId,
				deviceId: null,
				currency: Currency.CZK,
			},
			totalAmount: NonNegativeInteger(15000),
			tipAmount:
				params.tipAmount === undefined || params.tipAmount === null
					? null
					: NonNegativeInteger(params.tipAmount),
			amountInBtc:
				params.amountInBtc === null
					? undefined
					: NonNegativeInteger(params.amountInBtc ?? amountSats),
		});

	return { ...evoluFake, run };
};

const answerLnurlWith = (invoice: string) => (url: string) =>
	url.includes("/.well-known/lnurlp/")
		? {
				callback: "https://wallet.invalid/lnurlp/callback",
				nostrPubkey: "invented-wallet-pubkey",
			}
		: { pr: invoice };

const originalFetch = globalThis.fetch;
let answerFetch: ((url: string) => unknown) | null = null;
let refusedFetchUrls: string[] = [];

beforeEach(() => {
	gatewayConstructions = [];
	gatewayCreatePaymentParams = [];
	gatewayRefusal = null;
	answerFetch = null;
	refusedFetchUrls = [];

	globalThis.fetch = ((input: URL | RequestInfo) => {
		const url = String(input);
		const answer = answerFetch;

		if (answer === null) {
			refusedFetchUrls.push(url);
			return Promise.reject(
				new Error(`The test made no network answer available for ${url}`),
			);
		}

		return Promise.resolve({ json: () => Promise.resolve(answer(url)) });
	}) as typeof fetch;
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("createPaymentWithDefaultMethods", () => {
	it("routes a lud16 account with a gateway to paymentLnBridge", async () => {
		const { run, upserts } = setupPayment({ gatewayUrl });

		await run();

		expect(writesTo(upserts, "paymentLnZap")).toHaveLength(0);
		expect(writesTo(upserts, "paymentLnBridge")).toEqual([
			{
				table: "paymentLnBridge",
				values: {
					id: paymentId,
					accountId,
					amount: amountSats,
					lnInvoice: bridgeInvoice.lnInvoice,
					gatewayPaymentId,
					paymentHash: bridgeInvoice.paymentHash,
					expirationIn: bridgeInvoice.expiresAtSec,
				},
			},
		]);
	});

	it("routes a lud16 account without a gateway to paymentLnZap", async () => {
		answerFetch = answerLnurlWith(zapInvoice.lnInvoice);
		const { run, upserts } = setupPayment({ gatewayUrl: null });

		await run();

		expect(gatewayConstructions).toHaveLength(0);
		expect(writesTo(upserts, "paymentLnBridge")).toHaveLength(0);
		expect(writesTo(upserts, "paymentLnZap")[0]?.values).toMatchObject({
			id: paymentId,
			accountId,
			lnInvoice: zapInvoice.lnInvoice,
			paymentHash: zapInvoice.paymentHash,
			expirationIn: zapInvoice.expiresAtSec,
		});
	});

	it("asks the account's gateway for the account's own address", async () => {
		const { run } = setupPayment({ gatewayUrl });

		await run();

		expect(gatewayConstructions).toEqual([
			{
				url: gatewayUrl,
				options: { token: gatewayToken, verify: false },
			},
		]);
		expect(gatewayCreatePaymentParams).toEqual([
			{ lnAddresses: [lud16], amountMsat: amountSats * 1000 },
		]);
	});

	it("starts watching a bridge payment", async () => {
		const { run, upserts } = setupPayment({ gatewayUrl });

		await run();

		expect(writesTo(upserts, "paymentWatchingState")).toEqual([
			{
				table: "paymentWatchingState",
				values: {
					id: paymentId,
					verifiedAt: null,
					proveType: null,
					transactionId: null,
					stoppedAt: null,
					stopReason: null,
				},
			},
		]);
	});

	it("reaches the gateway without touching the network itself", async () => {
		const { run } = setupPayment({ gatewayUrl });

		await run();

		expect(refusedFetchUrls).toEqual([]);
	});

	it("writes the payment itself with the tip folded into the total", async () => {
		const { run, upserts } = setupPayment({ gatewayUrl, tipAmount: 2000 });

		await run();

		expect(writesTo(upserts, "payment")).toEqual([
			{
				table: "payment",
				values: {
					id: paymentId,
					deviceId: null,
					currency: Currency.CZK,
					direction: "incoming",
					tipAmount: 2000,
					totalAmount: 17000,
				},
			},
		]);
	});

	it("refuses a lightning method without an amount in bitcoin", async () => {
		const { run, upserts } = setupPayment({ gatewayUrl, amountInBtc: null });

		await expect(run()).rejects.toThrow(
			"BTC amount is required for BTC LN payment methods.",
		);

		expect(upserts).toHaveLength(0);
	});

	it("writes nothing at all when the gateway refuses to mint", async () => {
		gatewayRefusal = new Error("no wallet available");
		const { run, upserts } = setupPayment({ gatewayUrl });

		await expect(run()).rejects.toThrow("no wallet available");

		expect(upserts).toHaveLength(0);
	});

	it("leaves a bridge payment watched with no invoice when the account cannot be read, so nothing can ever settle it", async () => {
		const { run, upserts } = setupPayment({
			gatewayUrl,
			bridgeAccountRows: [],
		});

		await run();

		expect(gatewayConstructions).toHaveLength(0);
		expect(writesTo(upserts, "paymentLnBridge")).toHaveLength(0);
		expect(writesTo(upserts, "payment")).toHaveLength(1);
		expect(writesTo(upserts, "paymentWatchingState")).toHaveLength(1);
	});

	it("does not mint through the gateway for an account that is not a lightning address", async () => {
		const { run, upserts } = setupPayment({
			gatewayUrl,
			bridgeAccountRows: [
				{ _tag: "accountSpark", lud16, gatewayUrl, gatewayToken },
			],
		});

		await run();

		expect(gatewayConstructions).toHaveLength(0);
		expect(writesTo(upserts, "paymentLnBridge")).toHaveLength(0);
	});

	it("sends no token to a gateway that was configured without one", async () => {
		const { run } = setupPayment({
			gatewayUrl,
			bridgeAccountRows: [
				{ _tag: "accountLud16", lud16, gatewayUrl, gatewayToken: null },
			],
		});

		await run();

		expect(gatewayConstructions).toEqual([
			{ url: gatewayUrl, options: { token: undefined, verify: false } },
		]);
	});
});
