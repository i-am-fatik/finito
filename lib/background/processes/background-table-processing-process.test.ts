import { describe, expect, it } from "bun:test";
import { createIdFromString } from "@evolu/common";
import type { NotificationUI } from "@/hooks/use-background-processes";
import { backgroundTableProcessingProcess } from "@/lib/background/processes/background-table-processing-process";
import type { BackgroundProcess } from "@/lib/background/service";
import { type EvoluRow, setupEvolu, writesTo } from "@/lib/test-support/evolu";

const billId = createIdFromString("tableBill");
const beerId = createIdFromString("beer");
const beerCatalogId = createIdFromString("catalog:beer");
const paymentId = createIdFromString("tablePayment");
const deviceId = createIdFromString("merchantDevice");
const removeId = createIdFromString(`tableCloseout:${paymentId}:${beerId}`);

const settledLine = (overrides?: Partial<EvoluRow>): EvoluRow => ({
	paymentId,
	posBillId: billId,
	posBillItemId: beerId,
	catalogItemId: beerCatalogId,
	quantity: 2,
	totalAmount: 9000,
	...overrides,
});

const openBillRow = (quantityOnBill: number): EvoluRow => ({
	id: billId,
	tableId: createIdFromString("table"),
	currency: "CZK",
	table: { label: "Table 4", codes: [{ code: "Q1" }] },
	items: [
		{
			totalAmount: 4500 * quantityOnBill,
			quantity: quantityOnBill,
			item: { id: beerId, label: "Beer", price: 4500 },
		},
	],
});

const fakeNdk = {
	activeUser: { pubkey: "venue-pubkey" },
	signer: {
		pubkey: "venue-pubkey",
		encrypt: async () => "ciphertext",
		decrypt: async () => "{}",
	},
	subscribe: (
		_filter: unknown,
		_opts: unknown,
		handlers?: { onEose?: () => void },
	) => {
		handlers?.onEose?.();
		return { stop: () => {} };
	},
};

const flushPendingWork = async () => {
	for (let tick = 0; tick < 50; tick += 1) {
		await Promise.resolve();
	}
};

const setupProcess = (params: {
	settledLines: EvoluRow[];
	billOnTable: EvoluRow | undefined;
	writtenRemoveIds?: string[];
}) => {
	const evoluFake = setupEvolu({
		rowsFor: (query) => {
			if (query.includes("verifiedAt") && query.includes("posBillItemId")) {
				return params.settledLines;
			}
			if (query.includes("tableCode")) {
				return params.billOnTable === undefined ? [] : [params.billOnTable];
			}
			if (query.includes("posBillItemLine")) {
				return (params.writtenRemoveIds ?? []).map((id) => ({ id }));
			}
			return [];
		},
	});
	const deviceEvoluFake = setupEvolu({
		rowsFor: () => [{ id: deviceId }],
	});
	const reports: NotificationUI[] = [];

	const run = () =>
		backgroundTableProcessingProcess.run({
			evolu: evoluFake.evolu,
			deviceEvolu: deviceEvoluFake.evolu,
			ndk: fakeNdk,
			t: (key: string) => key,
			addNotification: (notification: NotificationUI) => {
				reports.push(notification);
				return {
					update: (updated: NotificationUI) => {
						reports.push(updated);
					},
					delete: () => {},
				};
			},
		} as unknown as Parameters<BackgroundProcess["run"]>[0]);

	return { ...evoluFake, reports, run };
};

describe("backgroundTableProcessingProcess", () => {
	it("closes out a settled payment from the database alone", async () => {
		const { run, upserts } = setupProcess({
			settledLines: [settledLine()],
			billOnTable: openBillRow(3),
		});

		const stop = await run();
		await flushPendingWork();
		stop();

		expect(writesTo(upserts, "posBillItemLine")).toEqual([
			{
				table: "posBillItemLine",
				values: {
					id: removeId,
					posBillId: billId,
					deviceId,
					catalogItemId: beerCatalogId,
					itemId: beerId,
					_tag: "remove",
					totalAmount: 9000,
					quantity: 2,
				},
			},
		]);
	});

	it("writes nothing for a settle it already closed out", async () => {
		const { run, upserts } = setupProcess({
			settledLines: [settledLine()],
			billOnTable: openBillRow(3),
			writtenRemoveIds: [removeId],
		});

		const stop = await run();
		await flushPendingWork();
		stop();

		expect(writesTo(upserts, "posBillItemLine")).toHaveLength(0);
	});

	it("removes only what the bill still carries and reports the overpayment", async () => {
		const { run, upserts, reports } = setupProcess({
			settledLines: [settledLine()],
			billOnTable: openBillRow(1),
		});

		const stop = await run();
		await flushPendingWork();
		stop();

		expect(writesTo(upserts, "posBillItemLine")).toEqual([
			{
				table: "posBillItemLine",
				values: {
					id: removeId,
					posBillId: billId,
					deviceId,
					catalogItemId: beerCatalogId,
					itemId: beerId,
					_tag: "remove",
					totalAmount: 4500,
					quantity: 1,
				},
			},
		]);
		expect(
			reports.some(
				(report) =>
					report.type === "warning" && report.description.includes("overpaid"),
			),
		).toBe(true);
	});

	it("leaves a settle alone when its bill is gone and still reports the overpayment", async () => {
		const { run, upserts, reports } = setupProcess({
			settledLines: [settledLine()],
			billOnTable: undefined,
		});

		const stop = await run();
		await flushPendingWork();
		stop();

		expect(writesTo(upserts, "posBillItemLine")).toHaveLength(0);
		expect(reports.some((report) => report.type === "warning")).toBe(false);
	});
});
