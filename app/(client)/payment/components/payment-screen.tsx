import {
	createIdFromString,
	type KyselyNotNull,
	sqliteTrue,
} from "@evolu/common";
import { useMutation } from "@tanstack/react-query";
import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { motion } from "framer-motion";
import { useAtomValue } from "jotai";
import {
	CheckIcon,
	CopyIcon,
	LoaderCircleIcon,
	SquircleDashedIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { type FC, useState } from "react";
import { useTranslation } from "react-i18next";
import { accountAtom } from "@/atoms/account";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { SelectButton } from "@/components/ui/select-button";
import { Spinner } from "@/components/ui/spinner";
import { useClipboard } from "@/hooks/use-clipboard";
import { useEvolu } from "@/hooks/use-evolu";
import { useEvoluQuery } from "@/hooks/use-evolu-query";
import { useTableGuestWithoutAccount } from "@/hooks/use-table-guest";
import type { ScreenData } from "@/lib/bill/driver";
import { createQuery } from "@/lib/evolu";
import type { Id } from "@/lib/evolu/types";
import { getBtcWalletAdapter } from "@/lib/payment/btc-wallet/registry";
import { createOutgoingPayment } from "@/lib/payment/service";
import {
	Currency,
	Integer,
	NonEmptyString,
	NonNegativeInteger,
} from "@/lib/shared/types";
import { formatMoney } from "@/lib/shared/utils/format";
import { extractBtcAmountFromLightningInvoice } from "@/lib/shared/utils/ln";

const btcWalletsQuery = createQuery((db) =>
	db
		.selectFrom("account")
		.select(["id", "name"] as const)
		.where("account.isDeleted", "is not", sqliteTrue)
		.where("account.name", "is not", null)
		.where("account._tag", "in", ["accountSpark", "accountNwc"])
		.$narrowType<{
			name: KyselyNotNull;
		}>(),
);

const openInWallet = (lnInvoice: NonEmptyString) => {
	const walletUrl = `lightning:${lnInvoice}`;
	if (isTauri()) {
		void openUrl(walletUrl).catch(() => undefined);
		return;
	}

	const a = document.createElement("a");
	a.style.display = "none";
	a.href = walletUrl;

	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
};

const OpenInWalletButton: FC<{
	lnInvoice: NonEmptyString;
}> = (props) => {
	const { t } = useTranslation();

	return (
		<Button
			size={"lg"}
			className={"h-12 flex-1"}
			onClick={() => openInWallet(props.lnInvoice)}
		>
			{t("client:paymentPage.wallets.external")}
		</Button>
	);
};

const CopyInvoiceButton: FC<{
	lnInvoice: NonEmptyString;
}> = (props) => {
	const { t } = useTranslation();
	const { copy, copied } = useClipboard();

	return (
		<Button
			size={"lg"}
			variant={"outline"}
			className={"h-12"}
			onClick={() =>
				void copy(props.lnInvoice, {
					customMessage: t("client:paymentPage.status.invoiceCopied"),
				})
			}
		>
			{copied ? (
				<CheckIcon className={"size-4"} />
			) : (
				<CopyIcon className={"size-4"} />
			)}
			{t("client:paymentPage.actions.copyInvoice")}
		</Button>
	);
};

const PayButton: FC<{
	lnInvoice: NonEmptyString;
}> = (props) => {
	const { t } = useTranslation();
	const totalAmount = extractBtcAmountFromLightningInvoice(props.lnInvoice);
	const [paymentMethod, setPaymentMethod] = useState<Id | "external" | null>(
		"external",
	);
	const evolu = useEvolu();
	const account = useAtomValue(accountAtom);
	const router = useRouter();
	const { mutateAsync: pay, isPending } = useMutation({
		mutationFn: async () => {
			if (paymentMethod === null) {
				return;
			}

			const paymentId = createIdFromString(props.lnInvoice);
			createOutgoingPayment({ evolu })({
				payment: {
					id: paymentId,
					totalAmount,
					currency: Currency.BTC,
					deviceId: account.device.id,
				},
			});

			if (paymentMethod === "external") {
				openInWallet(props.lnInvoice);
				return;
			}

			const accounts = await evolu.loadQuery(
				createQuery((db) =>
					db
						.selectFrom("account")
						.leftJoin("accountSpark", "accountSpark.id", "account.id")
						.select([
							"account.id as id",
							"account._tag as _tag",
							"accountSpark.mnemonic as mnemonic",
						] as const)
						.where("account.isDeleted", "is not", sqliteTrue)
						.where("accountSpark.mnemonic", "is not", null)
						.where("account.id", "=", paymentMethod)
						.where("account._tag", "in", ["accountSpark", "accountNwc"])
						.$narrowType<{
							_tag: KyselyNotNull;
							mnemonic: KyselyNotNull;
						}>(),
				),
			);

			const moneyAccount = accounts[0];
			if (moneyAccount === undefined) {
				return;
			}

			const btcWalletAdapter = getBtcWalletAdapter(
				moneyAccount._tag as "accountSpark" | "accountNwc",
			);
			const { feePaidSats } = await btcWalletAdapter.payInvoice({
				config: moneyAccount,
				input: {
					invoice: props.lnInvoice,
					maxFeeSats: NonNegativeInteger(3),
				},
			});

			const transactionId = createIdFromString(`outgoingLn:${paymentId}`);
			evolu.upsert("transaction", {
				id: transactionId,
				accountId: paymentMethod,
				_tag: "accountLud16",
				amount: Integer((feePaidSats ?? 0) + totalAmount),
				currency: Currency.BTC,
				occurredAt: Date.now(),
				note: NonEmptyString("Outgoing LN payment"),
				internalTransferGroupId: null,
			});
			const claimId = createIdFromString(
				`reconciliationClaim:lnPaymentHash:${transactionId}:${paymentId}`,
			);
			evolu.upsert("reconciliationClaim", {
				id: claimId,
				sourceType: "transaction",
				sourceId: transactionId,
				entityType: "payment",
				entityId: paymentId,
				confidence: 1,
				rule: "lnPaymentHash",
				createdBy: "syncLnZapTransfersProcess",
			});
			const allocationId = createIdFromString(
				`reconciliationClaimAllocation:${claimId}:product`,
			);
			evolu.upsert("reconciliationClaimAllocation", {
				id: allocationId,
				claimId,
				componentType: "product",
				amount: totalAmount,
			});
			{
				if (feePaidSats !== null && feePaidSats > 0) {
					const allocationId = createIdFromString(
						`reconciliationClaimAllocation:${claimId}:fee`,
					);
					evolu.upsert("reconciliationClaimAllocation", {
						id: allocationId,
						claimId,
						componentType: "fee",
						amount: feePaidSats,
					});
				}
			}

			router.push(`/history/detail?id=${encodeURIComponent(paymentId)}`);
		},
	});

	const { data: btcWallets } = useEvoluQuery(btcWalletsQuery);

	const options = [
		...btcWallets.map(
			(btcWallet) =>
				({
					value: btcWallet.id,
					label: btcWallet.name,
				}) as const,
		),
		{
			value: "external",
			label: t("client:paymentPage.wallets.external"),
		} as const,
	];

	return (
		<>
			<SelectButton<typeof paymentMethod>
				value={paymentMethod}
				onValueChange={setPaymentMethod}
				options={options}
				size={"lg"}
				className={"h-12 flex-1"}
			/>
			<Button
				className={"h-12 w-60"}
				size={"lg"}
				disabled={isPending}
				onClick={() => void pay()}
			>
				{isPending ? (
					<Spinner />
				) : (
					<>
						{t("client:paymentPage.actions.pay")}
						<motion.span
							key={`${totalAmount} BTC`}
							initial={{ scale: 1.1, opacity: 0.5 }}
							animate={{ scale: 1, opacity: 1 }}
						>
							{formatMoney({
								value: totalAmount,
								currency: Currency.BTC,
							})}
						</motion.span>
					</>
				)}
			</Button>
		</>
	);
};

export const PaymentScreen: FC<{
	screen: Extract<
		ScreenData,
		{
			variant: "payment";
		}
	>;
}> = (props) => {
	const { t } = useTranslation();
	const { copy } = useClipboard();
	const isTableGuest = useTableGuestWithoutAccount();

	return (
		<>
			<div className={"mb-28 flex flex-col grow"}>
				<div
					className={
						"fixed w-xl h-full max-w-full flex justify-center items-center pb-60"
					}
				>
					<SquircleDashedIcon
						size={300}
						className={"text-muted-foreground opacity-5"}
					/>
				</div>

				<div
					className={
						"w-full flex h-full pb-80 flex-col items-center gap-12 justify-evenly"
					}
				>
					<div className={"flex flex-col items-center gap-4"}>
						<div className={"text-2xl"}>
							<strong>
								{formatMoney({
									value: props.screen.payload.payment.totalAmount,
									currency: props.screen.payload.payment.currency,
								})}
							</strong>
						</div>
					</div>

					{props.screen.payload.payment.paymentSpecification.type ===
						"lnInvoice" && (
						<div className={"px-16"}>
							<Button
								className={
									"w-full aspect-square h-auto p-6 bg-white dark:bg-white dark:hover:bg-gray-300"
								}
								variant={"outline"}
								onClick={() => {
									if (
										props.screen.payload.payment.paymentSpecification.type !==
										"lnInvoice"
									) {
										return;
									}

									return copy(
										props.screen.payload.payment.paymentSpecification.lnInvoice,
										{
											customMessage: t(
												"client:paymentPage.status.invoiceCopied",
											),
										},
									);
								}}
							>
								<QRCodeSVG
									className={"w-full h-full size-6"}
									size={512}
									value={
										props.screen.payload.payment.paymentSpecification.lnInvoice
									}
								/>
							</Button>
						</div>
					)}

					<div className={"flex flex-col items-center gap-4"}>
						<LoaderCircleIcon className="animate-spin size-12 text-muted-foreground" />

						<div className={"text-xs text-muted-foreground"}>
							{t("client:paymentPage.status.waitingForPayment")}
						</div>
					</div>
				</div>
			</div>

			{props.screen.payload.payment.paymentSpecification.type ===
				"lnInvoice" && (
				<div
					className={
						"bg-card rounded-t-2xl w-full max-w-xl shadow-2xl fixed bottom-0"
					}
					style={{
						paddingBottom: "env(safe-area-inset-bottom)",
					}}
				>
					<Collapsible open={true}>
						<CollapsibleContent>
							<div className={"flex flex-col gap-4 shadow-2xl p-4"}>
								<div className={"flex flex-col gap-4"}>
									<div className={"flex gap-2"}>
										<ButtonGroup className={"w-full"}>
											{isTableGuest ? (
												<OpenInWalletButton
													lnInvoice={
														props.screen.payload.payment.paymentSpecification
															.lnInvoice
													}
												/>
											) : (
												<PayButton
													lnInvoice={
														props.screen.payload.payment.paymentSpecification
															.lnInvoice
													}
												/>
											)}
											<CopyInvoiceButton
												lnInvoice={
													props.screen.payload.payment.paymentSpecification
														.lnInvoice
												}
											/>
										</ButtonGroup>
									</div>
								</div>
							</div>
						</CollapsibleContent>
					</Collapsible>
				</div>
			)}
		</>
	);
};
