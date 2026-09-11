import { beforeEach, describe, expect, it, jest, mock } from "bun:test";
import { createId, createRandomBytes, err, ok } from "@evolu/common";
import type { TFunction } from "i18next";
import type {
	BillDriver,
	BillDriverSubscriptionEvent,
	ScreenData,
} from "@/lib/bill/driver";
import type { TablePaymentRequest } from "@/lib/contracts/table";
import {
	Currency,
	Integer,
	NonNegativeInteger,
	Uuid7,
} from "@/lib/shared/types";

type SubscribeProps = Parameters<BillDriver["subscribe"]>[0];

type TableEvent = { billScreenData: unknown; subscriptionId: unknown };

type TableEventListeners = {
	billChange: (event: TableEvent) => Promise<null>;
	paymentFinished: (event: TableEvent) => Promise<null>;
};

type BusCall = {
	name: string;
	input: Record<string, unknown>;
	ignoreResponse: boolean;
};

const createTableBus = () => ({
	calls: [] as BusCall[],
	listeners: null as TableEventListeners | null,
	listenerClosed: false,
	listenFails: false,
	subscribeFails: false,
	payAnswer: ok({ variant: "payment", payload: {} }) as ReturnType<
		typeof ok<{ variant: string; payload: unknown }>
	>,
});

let bus = createTableBus();

mock.module("@/lib/table/message-bus", () => ({
	tableEventMessageBus: {
		createInstance: () => ({
			listen: async (listeners: TableEventListeners) => {
				if (bus.listenFails) {
					return err(new Error("the listener was refused"));
				}

				bus.listeners = listeners;

				return ok({
					close: () => {
						bus.listenerClosed = true;
					},
				});
			},
		}),
	},
	tableRequestMessageBus: {
		createInstance: () => ({
			getClient: () => ({
				call: async (
					name: string,
					input: Record<string, unknown>,
					options?: { ignoreResponse?: boolean },
				) => {
					bus.calls.push({
						name,
						input,
						ignoreResponse: options?.ignoreResponse === true,
					});

					if (name === "createPaymentFromSubscribedBill") {
						return bus.payAnswer;
					}

					if (name === "subscribeToBillByQrCode" && bus.subscribeFails) {
						return err(new Error("the bill was refused"));
					}

					return ok(null);
				},
			}),
		}),
	},
}));

const { TableDriver } = await import("@/lib/bill/drivers/table-driver");

const guestNdk = {
	signer: { pubkey: "guest-pubkey" },
	activeUser: { pubkey: "guest-pubkey" },
} as unknown as SubscribeProps["ndk"];

const createScreenStack = () => {
	const pushed: ScreenData[] = [];
	const replacedLast: ScreenData[] = [];
	const replaced: ScreenData[] = [];
	let backs = 0;
	const handle = {
		replace: (screen: ScreenData) => {
			replaced.push(screen);
		},
	};

	return {
		pushed,
		replacedLast,
		replaced,
		backs: () => backs,
		stack: {
			push: (screen: ScreenData) => {
				pushed.push(screen);
				return handle;
			},
			replaceLast: (screen: ScreenData) => {
				replacedLast.push(screen);
				return handle;
			},
			back: () => {
				backs += 1;
			},
		} satisfies SubscribeProps["screenStack"],
	};
};

const bill = {
	bill: {
		currency: Currency.CZK,
		itemLines: [
			{
				quantity: 2,
				item: { id: "beer", label: "Beer", price: Integer(4500) },
			},
		],
	},
};

const paymentRequest: TablePaymentRequest = {
	paymentId: createId({ randomBytes: createRandomBytes() }),
	items: [{ id: "beer", label: "Beer", price: Integer(4500), quantity: 1 }],
	tip: NonNegativeInteger(0),
	currency: Currency.CZK,
	paymentOption: { type: "btcLn" },
};

let screens = createScreenStack();
let closeEvents: BillDriverSubscriptionEvent[] = [];

const subscribeTo = async (billId = "t-venuepubkey-Q1") =>
	await new TableDriver().subscribe({
		billId,
		callback: (event) => closeEvents.push(event),
		screenStack: screens.stack,
		ndk: guestNdk,
		t: ((key: string) => key) as unknown as TFunction,
	});

const callsTo = (name: string) =>
	bus.calls.filter((call) => call.name === name);

const ownSubscriptionId = () =>
	callsTo("subscribeToBillByQrCode")[0]?.input.subscriptionId;

const sendBillChange = async (subscriptionId: unknown) =>
	await bus.listeners?.billChange({ billScreenData: bill, subscriptionId });

const sendPaymentFinished = async (subscriptionId: unknown) =>
	await bus.listeners?.paymentFinished({
		billScreenData: bill,
		subscriptionId,
	});

const payFrom = (screen: ScreenData | undefined) => {
	if (screen?.variant !== "table") {
		throw new Error("the table screen was never put up");
	}

	return screen.pay;
};

beforeEach(() => {
	bus = createTableBus();
	screens = createScreenStack();
	closeEvents = [];
});

describe("TableDriver", () => {
	it("leaves a bill id that is not a table code to another driver", async () => {
		expect(await subscribeTo("menu-venuepubkey-Q1")).toBeNull();
		expect(bus.calls).toHaveLength(0);
	});

	it("keeps a table code that carries dashes whole", async () => {
		await subscribeTo("t-venuepubkey-Q1-9f-c3");

		expect(callsTo("subscribeToBillByQrCode")[0]?.input).toMatchObject({
			qrCodeId: "Q1-9f-c3",
			pubkey: "guest-pubkey",
		});
	});

	it("shows the bill the till sends back", async () => {
		await subscribeTo();
		await sendBillChange(ownSubscriptionId());

		expect(screens.replacedLast).toHaveLength(1);
		expect(screens.replacedLast[0]).toMatchObject({
			variant: "table",
			payload: bill,
		});
	});

	it("ignores a bill meant for another guest", async () => {
		await subscribeTo();
		await sendBillChange(Uuid7.random());

		expect(screens.replacedLast).toHaveLength(0);
	});

	it("keeps the screen it already put up and replaces its content", async () => {
		await subscribeTo();
		await sendBillChange(ownSubscriptionId());
		await sendBillChange(ownSubscriptionId());

		expect(screens.replacedLast).toHaveLength(1);
		expect(screens.replaced).toHaveLength(1);
	});

	it("refreshes the bill under the invoice without touching the invoice", async () => {
		await subscribeTo();
		await sendBillChange(ownSubscriptionId());
		await payFrom(screens.replacedLast[0])(paymentRequest);
		await sendBillChange(ownSubscriptionId());

		expect(screens.pushed).toHaveLength(1);
		expect(screens.replaced).toHaveLength(1);
		expect(screens.replacedLast).toHaveLength(1);
	});

	it("takes the guest back to the bill after a refusal", async () => {
		jest.useFakeTimers();
		bus.payAnswer = ok({
			variant: "info",
			payload: { status: "failure", text: "Beer is no longer on the bill" },
		});

		await subscribeTo();
		await sendBillChange(ownSubscriptionId());
		await payFrom(screens.replacedLast[0])(paymentRequest);

		expect(screens.pushed).toHaveLength(1);
		expect(screens.backs()).toBe(0);

		jest.advanceTimersByTime(4_000);

		expect(screens.backs()).toBe(1);
		jest.useRealTimers();
	});

	it("keeps taking bill changes after a refusal", async () => {
		bus.payAnswer = ok({
			variant: "info",
			payload: { status: "failure", text: "Beer is no longer on the bill" },
		});

		await subscribeTo();
		await sendBillChange(ownSubscriptionId());
		await payFrom(screens.replacedLast[0])(paymentRequest);
		await sendBillChange(ownSubscriptionId());

		expect(screens.replaced).toHaveLength(1);
	});

	it("tells the guest the bill is paid and refreshes what is left", async () => {
		await subscribeTo();
		await sendBillChange(ownSubscriptionId());
		await sendPaymentFinished(ownSubscriptionId());

		expect(screens.replacedLast[1]).toMatchObject({
			variant: "info",
			payload: { status: "success" },
		});
		expect(screens.replaced).toHaveLength(1);
	});

	it("ignores a settlement meant for another guest", async () => {
		await subscribeTo();
		await sendBillChange(ownSubscriptionId());
		await sendPaymentFinished(Uuid7.random());

		expect(screens.replacedLast).toHaveLength(1);
	});

	it("drops the listener when the till refuses the subscription", async () => {
		bus.subscribeFails = true;

		expect(await subscribeTo()).toBeNull();
		expect(bus.listenerClosed).toBe(true);
		expect(closeEvents).toHaveLength(1);
	});

	it("says nothing to the till when it cannot listen at all", async () => {
		bus.listenFails = true;

		expect(await subscribeTo()).toBeNull();
		expect(bus.calls).toHaveLength(0);
		expect(closeEvents).toHaveLength(1);
	});

	it("asks the till again while nobody is paying", async () => {
		jest.useFakeTimers();
		await subscribeTo();

		jest.advanceTimersByTime(20_000);

		expect(callsTo("subscribeToBillByQrCode")).toHaveLength(2);
		expect(callsTo("subscribeToBillByQrCode")[1]?.ignoreResponse).toBe(true);
		jest.useRealTimers();
	});

	it("keeps asking while the guest sits on the invoice", async () => {
		jest.useFakeTimers();
		await subscribeTo();
		await sendBillChange(ownSubscriptionId());
		await payFrom(screens.replacedLast[0])(paymentRequest);

		jest.advanceTimersByTime(20_000);

		expect(callsTo("subscribeToBillByQrCode")).toHaveLength(2);
		jest.useRealTimers();
	});

	it("unsubscribes and stops asking when the guest leaves", async () => {
		jest.useFakeTimers();
		const subscription = await subscribeTo();
		await subscription?.close();

		jest.advanceTimersByTime(20_000);

		expect(bus.listenerClosed).toBe(true);
		expect(callsTo("unsubscribe")[0]?.ignoreResponse).toBe(true);
		expect(callsTo("subscribeToBillByQrCode")).toHaveLength(1);
		jest.useRealTimers();
	});
});
