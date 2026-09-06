import { SparkWallet } from "@buildonspark/spark-sdk";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useAtomValue } from "jotai";
import { accountAtom } from "@/atoms/account";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryWithCached } from "@/hooks/use-query-with-cached";
import { currencyConverter } from "@/lib/integrations/currency-converter/currency-converter";
import { Currency, Integer } from "@/lib/shared/types";
import { formatMoney } from "@/lib/shared/utils/format";

export const WalletBalance = () => {
	const { mnemonic, id } = useAtomValue(accountAtom);

	const { data } = useQueryWithCached<Integer>({
		queryKey: `${id}:walletStatus`,
		queryFn: async () => {
			const { wallet } = await SparkWallet.initialize({
				mnemonicOrSeed: mnemonic,
				options: {
					network: "MAINNET",
				},
			});

			const { balance } = await wallet.getBalance();

			return Integer(Math.round(Number(balance)));
		},
	});

	const { data: amountInFiat } = useQuery({
		queryKey: [`walletAmountInFiat:${data}`],
		enabled: data !== undefined,
		queryFn: async () => {
			if (data === 0 || data === undefined) {
				return data;
			}

			return await currencyConverter.convert({
				amount: data,
				sourceCurrency: Currency.BTC,
				targetCurrency: Currency.CZK,
			});
		},
	});

	return (
		<div className={"py-4 text-center"}>
			<motion.div
				className={"flex justify-center"}
				key={`${data}`}
				initial={{ scale: 1.1, opacity: 0.5 }}
				animate={{ scale: 1, opacity: 1 }}
			>
				{data !== undefined ? (
					formatMoney({
						value: data,
						currency: Currency.BTC,
					})
				) : (
					<Skeleton className={"h-7 w-30"} />
				)}
			</motion.div>
			<div
				className={
					"text-xs mt-1 pt-2.5 font-medium text-muted-foreground flex justify-center"
				}
			>
				{amountInFiat !== null && amountInFiat !== undefined ? (
					formatMoney({
						value: Integer(Math.round(Number(amountInFiat))),
						currency: Currency.CZK,
					})
				) : (
					<Skeleton className={"h-5 w-30"} />
				)}
			</div>
		</div>
	);
};
