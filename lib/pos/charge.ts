import { createId, createRandomBytes } from "@evolu/common";
import type { EvoluSchemaType } from "@/lib/evolu";
import type { Id } from "@/lib/evolu/types";
import type { createPaymentWithDefaultMethods } from "@/lib/payment/service";
import { Currency, Integer, NonNegativeInteger } from "@/lib/shared/types";

type CreateParams = Parameters<
	ReturnType<typeof createPaymentWithDefaultMethods>
>[0];
export type ChargeItems = Extract<CreateParams, { items: unknown[] }>["items"];

export type ChargeParams = {
	billId: Id;
	currency: Currency;
	total: Integer;
	items: ChargeItems;
};

export type BillChargerDeps = {
	deviceId: Id;
	createPayment: ReturnType<typeof createPaymentWithDefaultMethods>;
	convertToBtc: (
		amount: Integer,
		currency: Currency,
	) => Promise<Integer | null>;
	linkPayment: (params: { billId: Id; paymentId: Id }) => void;
	dropPayment: (params: { paymentId: Id }) => void;
};

type BillLine = {
	quantity: number;
	item: Omit<EvoluSchemaType["item"], "id">;
};

export const createPaymentItemFromBillLine = (
	line: BillLine,
	quantity: number = line.quantity,
): ChargeItems[number] => ({
	item: line.item,
	quantity,
	totalAmount: Integer(Math.round(line.item.price * quantity)),
	optionalityChecked: null,
});

export const createBillCharger = (deps: BillChargerDeps) => {
	const mint = async (params: ChargeParams) => {
		const amountInBtc =
			params.currency === Currency.BTC
				? params.total
				: await deps.convertToBtc(params.total, params.currency);

		return await deps.createPayment({
			payment: {
				id: createId({ randomBytes: createRandomBytes() }),
				deviceId: deps.deviceId,
				currency: params.currency,
			},
			items: params.items,
			tipAmount: null,
			amountInBtc:
				amountInBtc === null ? undefined : NonNegativeInteger(amountInBtc),
		});
	};

	const charge = async (params: ChargeParams) => {
		const paymentId = await mint(params);
		deps.linkPayment({ billId: params.billId, paymentId });

		return paymentId;
	};

	return {
		charge,
		recharge: async (params: ChargeParams & { paymentId: Id }) => {
			const paymentId = await mint(params);
			deps.dropPayment({ paymentId: params.paymentId });
			deps.linkPayment({ billId: params.billId, paymentId });

			return paymentId;
		},
	};
};
