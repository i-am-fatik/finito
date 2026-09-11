import type { Page } from "@playwright/test";
import clientLocale from "@/locales/en/client";
import { expect, test } from "./fixtures";

const paymentPage = clientLocale.paymentPage;

const billPaid = "The bill is successfully paid!";

test.describe.configure({ timeout: 120_000 });

const guestUrlOf = (pubkey: string, code: string) => `/#t-${pubkey}-${code}`;

const payButton = (guest: Page) =>
	guest.getByRole("button", { name: paymentPage.actions.pay });

test("shows the guest the bill the till holds for that table", async ({
	page,
	guest,
	harness,
	gateway,
	relay,
}) => {
	const seeded = await harness.runScenario("table", {
		gateway: { url: gateway.url, token: gateway.token, lud16: gateway.lud16 },
	});

	await page.goto(`/admin/pos?id=${seeded.billId}`);
	await expect(page.getByText(seeded.item.label, { exact: true })).toHaveCount(
		2,
		{ timeout: 20_000 },
	);
	await expect.poll(() => relay.subscriptionCount()).toBeGreaterThan(0);

	await guest.goto(guestUrlOf(seeded.pubkey, seeded.code));

	await expect(guest.getByText(seeded.item.label)).toBeVisible({
		timeout: 30_000,
	});
	await expect(guest.getByText(seeded.venueName)).toBeVisible();
	await expect(payButton(guest)).toBeEnabled();
});

test("takes the guest through the gateway and clears what was paid off the till", async ({
	page,
	guest,
	harness,
	gateway,
	relay,
}) => {
	const seeded = await harness.runScenario("table", {
		gateway: { url: gateway.url, token: gateway.token, lud16: gateway.lud16 },
	});

	await page.goto(`/admin/pos?id=${seeded.billId}`);
	await expect(page.getByText(seeded.item.label, { exact: true })).toHaveCount(
		2,
		{ timeout: 20_000 },
	);
	await expect.poll(() => relay.subscriptionCount()).toBeGreaterThan(0);

	await guest.goto(guestUrlOf(seeded.pubkey, seeded.code));
	await expect(payButton(guest)).toBeEnabled({ timeout: 30_000 });
	await payButton(guest).click();

	await expect(
		guest.getByText(paymentPage.status.waitingForPayment),
	).toBeVisible({ timeout: 30_000 });
	await expect.poll(() => gateway.minted.length, { timeout: 30_000 }).toBe(1);

	const minted = gateway.minted[0];
	expect(minted?.amountMsat).toBe(12_000_000);

	gateway.settle();

	await expect(guest.getByText(billPaid)).toBeVisible({ timeout: 30_000 });
	await expect(page.getByText(seeded.item.label, { exact: true })).toHaveCount(
		1,
		{ timeout: 30_000 },
	);
});
