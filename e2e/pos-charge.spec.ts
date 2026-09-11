import billsLocale from "@/locales/en/bills";
import paymentsLocale from "@/locales/en/payments";
import posLocale from "@/locales/en/pos";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const posBill = posLocale.bill;
const posClosed = posLocale.closed;
const posTabs = posLocale.tabs;
const charge = posBill.charge;
const payInCash = paymentsLocale.detail.actions["pay-in-cash"];

const createUniqueLabel = (prefix: string) =>
	`${prefix} ${Date.now()} ${Math.round(Math.random() * 10_000)}`;

const escapeRegExp = (value: string) =>
	value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const withLabel = (template: string) =>
	new RegExp(escapeRegExp(template).replace("\\{\\{label\\}\\}", "#\\d+"));

const payButton = (page: Page) =>
	page.getByRole("button", {
		name: new RegExp(`^${escapeRegExp(posBill.pay)}`),
	});

const billTabs = (page: Page) => page.getByRole("tab", { name: /^#\d+$/ });

test("keeps a charged bill on the till until it is paid and then files it under paid bills", async ({
	page,
	harness,
}) => {
	const label = createUniqueLabel("Till beer");
	await harness.runScenario("pos-charge", { item: { label, price: 12_000 } });

	await page.goto("/admin/pos");
	await page.getByText(label, { exact: true }).click();
	await expect(page).toHaveURL(/\/admin\/pos\?id=/, { timeout: 20_000 });
	await expect(page.getByText(label, { exact: true })).toHaveCount(2);

	await payButton(page).click();

	await expect(page.getByText(charge.state.awaiting)).toBeVisible();
	await expect(page.getByText(charge.cashOnly)).toBeVisible();
	await expect(page.getByText(label, { exact: true })).toHaveCount(1);
	await expect(payButton(page)).toHaveCount(0);

	await page.getByRole("button", { name: charge.back }).click();

	await expect(page.getByText(label, { exact: true })).toHaveCount(2);
	await expect(payButton(page)).toBeEnabled();

	await payButton(page).click();
	await expect(page.getByText(charge.state.awaiting)).toBeVisible();
	await page.getByRole("button", { name: charge.cash }).click();
	await page
		.getByRole("alertdialog")
		.getByRole("button", { name: payInCash })
		.click();

	await expect(page.getByText(withLabel(posBill.paid))).toBeVisible();
	await expect(page.getByText(posBill.noItemsInCart)).toBeVisible();
	await expect(billTabs(page)).toHaveCount(0);

	await page.getByRole("button", { name: posClosed.open }).click();
	const paidBills = page.getByRole("dialog");
	await expect(paidBills).toContainText("CZK 120.00");
	await expect(
		paidBills.getByRole("button", { name: posClosed.payment }),
	).toHaveAttribute("href", /\/admin\/payments\/detail\?id=/);
	await page.keyboard.press("Escape");

	await page.goto("/admin/payments/bills");
	await expect(page.getByText(billsLocale.status.closed).first()).toBeVisible({
		timeout: 20_000,
	});
});

test("offers to take back a deleted bill and brings it back on undo", async ({
	page,
	harness,
}) => {
	const label = createUniqueLabel("Till coffee");
	await harness.runScenario("pos-charge", { item: { label } });

	await page.goto("/admin/pos");
	await page.getByText(label, { exact: true }).click();
	await expect(page).toHaveURL(/\/admin\/pos\?id=/, { timeout: 20_000 });
	await expect(billTabs(page)).toHaveCount(1);
	await expect(page.getByText(label, { exact: true })).toHaveCount(2);

	await page
		.getByRole("button", { name: posTabs.deleteBill.confirm })
		.first()
		.click();
	await page
		.getByRole("alertdialog")
		.getByRole("button", { name: posTabs.deleteBill.confirm })
		.click();

	await expect(page.getByText(withLabel(posTabs.deleted))).toBeVisible();
	await expect(billTabs(page)).toHaveCount(0);

	await page.getByRole("button", { name: posTabs.undoDelete }).click();

	await expect(billTabs(page)).toHaveCount(1);
	await expect(page.getByText(label, { exact: true })).toHaveCount(2);
});
