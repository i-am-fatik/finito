import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { accountAtom } from "@/atoms/account";
import { useBill } from "@/hooks/use-bill";
import { useEvolu } from "@/hooks/use-evolu";
import { useNostr } from "@/hooks/use-nostr";
import type { Id } from "@/lib/evolu/types";
import { currencyConverter } from "@/lib/integrations/currency-converter/currency-converter";
import { createPaymentWithDefaultMethods } from "@/lib/payment/service";
import { type ChargeParams, createBillCharger } from "@/lib/pos/charge";
import { Currency } from "@/lib/shared/types";

export const useChargeBill = () => {
	const { t } = useTranslation();
	const evolu = useEvolu();
	const { ndk } = useNostr();
	const account = useAtomValue(accountAtom);
	const { chargeBill, cancelCharge, dropPayment } = useBill();
	const charger = createBillCharger({
		deviceId: account.device.id,
		createPayment: createPaymentWithDefaultMethods({ evolu, ndk }),
		convertToBtc: (amount, currency) =>
			currencyConverter.convert({
				amount,
				sourceCurrency: currency,
				targetCurrency: Currency.BTC,
			}),
		linkPayment: chargeBill,
		dropPayment: dropPayment,
	});
	const reported = (minting: Promise<Id>) =>
		minting.catch((error: unknown) => {
			console.error(error);
			toast.error(t("pos:bill.charge.failed"));

			return undefined;
		});

	return {
		charge: (params: ChargeParams) => reported(charger.charge(params)),
		recharge: (params: ChargeParams & { paymentId: Id }) =>
			reported(charger.recharge(params)),
		cancelCharge,
	};
};
