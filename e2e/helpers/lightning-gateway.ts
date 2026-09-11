import type { BrowserContext } from "@playwright/test";
import { sha256 } from "@noble/hashes/sha2.js";
import { hex } from "@scure/base";
import { testLightningInvoice } from "@/lib/test-support/bolt11";

const gatewayHost = "gateway.finito-e2e.example";
const walletHost = "wallet.finito-e2e.example";
const expirySeconds = 3_600;
const msatPerSat = 1_000;
const afterHandshakeMs = 100;

export const gatewayUrl = `https://${gatewayHost}`;
export const gatewayToken = "e2e-gateway-token";
export const walletAddress = `till@${walletHost}`;

type MintedPayment = {
	id: string;
	bolt11: string;
	paymentHash: string;
	preimage: string;
	amountMsat: number;
	createdAtSec: number;
	expiresAtSec: number;
	settled: boolean;
};

const payRequestMetadata = JSON.stringify([
	["text/plain", `finito e2e ${walletAddress}`],
]);

const descriptionHash = hex.encode(
	sha256(new TextEncoder().encode(payRequestMetadata)),
);

const idFrom = (url: string) =>
	decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");

export const fakeLightningGateway = () => {
	const minted: MintedPayment[] = [];
	const listeners = new Map<string, Set<(frame: string) => void>>();
	const tickets = new Map<string, string>();

	const wireOf = (payment: MintedPayment) => ({
		id: payment.id,
		ln_address: walletAddress,
		bolt11: payment.bolt11,
		payment_hash: payment.paymentHash,
		verify_url: `https://${walletHost}/lnurlp/verify/${payment.id}`,
		incoming_amount: {
			value: String(payment.amountMsat),
			asset_code: "BTC",
			asset_scale: 11,
		},
		created_at: new Date(payment.createdAtSec * 1_000).toISOString(),
		expires_at: new Date(payment.expiresAtSec * 1_000).toISOString(),
		status: payment.settled ? "paid" : "pending",
		preimage: payment.settled ? payment.preimage : null,
	});

	const mint = (amountMsat: number) => {
		const id = `e2e-payment-${minted.length + 1}`;
		const createdAtSec = Math.floor(Date.now() / 1_000);
		const invoice = testLightningInvoice({
			amountSats: amountMsat / msatPerSat,
			createdAtSec,
			expirySeconds,
			preimageSeed: id,
			descriptionHash,
		});
		const payment: MintedPayment = {
			id,
			bolt11: invoice.lnInvoice,
			paymentHash: invoice.paymentHash,
			preimage: invoice.preimage,
			amountMsat,
			createdAtSec,
			expiresAtSec: invoice.expiresAtSec,
			settled: false,
		};
		minted.push(payment);

		return payment;
	};

	const paymentOf = (id: string) =>
		minted.find((payment) => payment.id === id);

	return {
		url: gatewayUrl,
		token: gatewayToken,
		lud16: walletAddress,
		minted,
		settle: (id?: string) => {
			const payment = id === undefined ? minted.at(-1) : paymentOf(id);
			if (payment === undefined) {
				throw new Error(`the gateway never minted payment ${id ?? "at all"}`);
			}

			payment.settled = true;
			const frame = JSON.stringify(wireOf(payment));
			for (const deliver of listeners.get(payment.id) ?? []) {
				deliver(frame);
			}

			return payment;
		},
		serve: async (context: BrowserContext) => {
			await context.route(
				`https://${walletHost}/.well-known/lnurlp/*`,
				async (route) =>
					await route.fulfill({
						json: {
							tag: "payRequest",
							callback: `https://${walletHost}/lnurlp/callback`,
							metadata: payRequestMetadata,
							minSendable: 1_000,
							maxSendable: 100_000_000_000,
						},
					}),
			);

			await context.route(
				`https://${walletHost}/lnurlp/verify/*`,
				async (route) => {
					const payment = paymentOf(idFrom(route.request().url()));
					if (payment === undefined) {
						await route.fulfill({ status: 404, json: { status: "ERROR" } });
						return;
					}

					await route.fulfill({
						json: {
							status: "OK",
							pr: payment.bolt11,
							settled: payment.settled,
							preimage: payment.settled ? payment.preimage : null,
						},
					});
				},
			);

			await context.route(`${gatewayUrl}/ws-tickets`, async (route) => {
				const asked = route.request().postDataJSON() as {
					payment_id?: string;
				};
				const ticket = `ticket-${tickets.size + 1}`;
				tickets.set(ticket, asked.payment_id ?? "");

				await route.fulfill({ json: { ticket } });
			});

			await context.route(
				`${gatewayUrl}/incoming-payments`,
				async (route) => {
					const asked = route.request().postDataJSON() as {
						incoming_amount: { value: string };
					};

					await route.fulfill({
						json: wireOf(mint(Number(asked.incoming_amount.value))),
					});
				},
			);

			await context.routeWebSocket(
				(url) => url.host === gatewayHost,
				(route) => {
					const asked = idFrom(route.url());
					const id = tickets.get(asked) ?? asked;
					const deliver = (frame: string) => {
						route.send(frame);
					};
					const forPayment = listeners.get(id) ?? new Set<typeof deliver>();
					forPayment.add(deliver);
					listeners.set(id, forPayment);

					const payment = paymentOf(id);
					if (payment !== undefined) {
						setTimeout(() => {
							deliver(JSON.stringify(wireOf(payment)));
						}, afterHandshakeMs);
					}

					route.onClose(() => {
						forPayment.delete(deliver);
					});
				},
			);
		},
	};
};

export type FakeLightningGateway = ReturnType<typeof fakeLightningGateway>;
