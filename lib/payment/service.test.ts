import { beforeEach, describe, expect, it, mock } from "bun:test";
import { createIdFromString } from "@evolu/common";
import * as ndk from "@nostr-dev-kit/ndk";
import { PaymentDefaultMethodType } from "@/lib/evolu/model/payment-default-method";
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

class FakeThunderBridge {
	constructor(url: string, options: GatewayConstruction["options"]) {
		gatewayConstructions.push({ url, options });
	}

	createPayment(params: GatewayCreatePaymentParams) {
		gatewayCreatePaymentParams.push(params);

		return Promise.resolve({
			id: gatewayPaymentId,
			bolt11: bridgeInvoice.lnInvoice,
		});
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

const setupPayment = (params: { gatewayUrl: string | null }) => {
	const bridgeAccountRows: EvoluRow[] = [
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
			// biome-ignore lint/suspicious/noExplicitAny: the NDK boundary is faked
			ndk: new FakeNdk({ explicitRelayUrls: ["wss://relay.invalid"] }) as any,
		})({
			payment: {
				id: paymentId,
				deviceId: null,
				currency: Currency.CZK,
			},
			totalAmount: NonNegativeInteger(15000),
			tipAmount: null,
			amountInBtc: NonNegativeInteger(amountSats),
		});

	return { ...evoluFake, run };
};

beforeEach(() => {
	gatewayConstructions = [];
	gatewayCreatePaymentParams = [];

	globalThis.fetch = (async (input: URL | RequestInfo) => {
		const url = String(input);

		return {
			json: async () =>
				url.includes("/.well-known/lnurlp/")
					? {
							callback: "https://wallet.invalid/lnurlp/callback",
							nostrPubkey: "invented-wallet-pubkey",
						}
					: { pr: zapInvoice.lnInvoice },
		};
	}) as typeof fetch;
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
});
