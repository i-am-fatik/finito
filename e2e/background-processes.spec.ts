import { hex } from "@scure/base";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import componentsLocale from "@/locales/en/components";
import { testLightningInvoice } from "@/lib/test-support/bolt11";
import { expect, test } from "./fixtures";

test.describe.configure({ timeout: 120_000 });

const notifications = componentsLocale.notifications;

const processTitles = [
	componentsLocale.notificationItem.backgroundTableProcessing.title,
	componentsLocale.notificationItem.verifyPayment.title,
	"Lightning gateway",
	"FIO transfers sync",
	"LN zap receipts",
	"NWC transfers sync",
	"NDK relay status",
];

test("brings up every background process on the till", async ({
	page,
	harness,
	gateway,
}) => {
	await harness.runScenario("table", {
		gateway: { url: gateway.url, token: gateway.token, lud16: gateway.lud16 },
	});

	await page.goto("/admin/pos");
	await page.getByRole("button", { name: notifications.open }).click();

	for (const title of processTitles) {
		await expect(page.getByText(title, { exact: true })).toBeVisible({
			timeout: 30_000,
		});
	}
});

test("reports every relay it is connected to", async ({
	page,
	harness,
	gateway,
}) => {
	await harness.runScenario("table", {
		gateway: { url: gateway.url, token: gateway.token, lud16: gateway.lud16 },
	});

	await page.goto("/admin/pos");
	await page.getByRole("button", { name: notifications.open }).click();

	await expect(page.getByText("Connected 4/4 relays.")).toBeVisible({
		timeout: 40_000,
	});
});

test("books an incoming bank transfer the fio plugin reports", async ({
	page,
	harness,
	bank,
}) => {
	bank.report({
		amount: 24_000,
		variableSymbol: "778899",
		note: "Bezhotovostní příjem",
		occurredOn: "2026-09-11+0200",
	});
	await harness.runScenario("bank", {
		apiUrl: bank.apiUrl,
		token: bank.token,
		iban: bank.iban,
	});

	await page.goto("/admin/pos");
	await page.getByRole("button", { name: notifications.open }).click();

	await expect(page.getByText("Synced 1 transfer(s).")).toBeVisible({
		timeout: 40_000,
	});

	await page.goto("/admin/payments/transactions");
	await expect(
		page.getByRole("row", {
			name: /E2E Bank.*\+24000\b.*Bezhotovostní příjem/,
		}),
	).toBeVisible({ timeout: 30_000 });
});

test("books an incoming zap the wallet receipted on nostr", async ({
	page,
	harness,
	relay,
}) => {
	const walletSecretKey = generateSecretKey();
	const walletPubkey = getPublicKey(walletSecretKey);
	const paymentSecretKey = generateSecretKey();
	const invoice = testLightningInvoice({
		amountSats: 12_000,
		createdAtSec: Math.floor(Date.now() / 1_000),
		expirySeconds: 3_600,
		preimageSeed: "e2e-zap",
	});

	const seeded = await harness.runScenario("zap", {
		lud16: "zap@wallet.finito-e2e.example",
		lnInvoice: invoice.lnInvoice,
		paymentHash: invoice.paymentHash,
		privateKey: hex.encode(paymentSecretKey),
		walletPubkey,
		amountSats: 12_000,
		expiresAtSec: invoice.expiresAtSec,
	});
	expect(seeded.watchable).toBe(1);

	await relay.publish(
		finalizeEvent(
			{
				kind: 9735,
				created_at: Math.floor(Date.now() / 1_000),
				tags: [
					["p", getPublicKey(paymentSecretKey)],
					["bolt11", invoice.lnInvoice],
					["preimage", invoice.preimage],
				],
				content: "",
			},
			walletSecretKey,
		),
	);

	await page.goto("/admin/pos");

	await page.goto("/admin/payments/transactions");
	await expect(
		page.getByRole("row", {
			name: /E2E Zap Wallet.*\+12000\b.*Incoming LN zap payment/,
		}),
	).toBeVisible({ timeout: 40_000 });
});

test("books an incoming payment the NWC wallet reports", async ({
	page,
	harness,
	wallet,
}) => {
	wallet.report({
		description: "E2E NWC top up",
		amountSats: 21_000,
		paymentHash: "cd".repeat(32),
	});
	await harness.runScenario("nwc", { credentials: wallet.credentials });

	await page.goto("/admin/pos");

	await page.goto("/admin/payments/transactions");
	await expect(
		page.getByRole("row", {
			name: /E2E NWC Wallet.*\+21000\b.*E2E NWC top up/,
		}),
	).toBeVisible({ timeout: 60_000 });
});
