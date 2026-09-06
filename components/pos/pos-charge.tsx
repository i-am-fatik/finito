"use client";

import {
	evoluJsonObjectFrom,
	type KyselyNotNull,
	sqliteTrue,
} from "@evolu/common";
import {
	CoinsIcon,
	FocusIcon,
	LoaderCircleIcon,
	RefreshCwIcon,
	Undo2Icon,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { type FC, useEffect, useMemo, useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import { FullscreenDialog } from "@/components/fullscreen-dialog";
import { LoadingIndicator } from "@/components/loading-indicator";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useChargeBill } from "@/hooks/use-charge-bill";
import { useEvolu } from "@/hooks/use-evolu";
import { useEvoluQuery } from "@/hooks/use-evolu-query";
import { useGlobalDialog } from "@/hooks/use-global-dialog";
import type { PosBill } from "@/hooks/use-pos";
import { createQuery } from "@/lib/evolu";
import type { Id } from "@/lib/evolu/types";
import { settlePaymentInCash } from "@/lib/payment/cash-settlement";
import { generateCzechBankQrCode } from "@/lib/payment/czech-bank-qr-generator";
import { resolvePaymentStatus } from "@/lib/payment/service";
import { ChargeState, resolveChargeState } from "@/lib/pos/bill-status";
import { createPaymentItemFromBillLine } from "@/lib/pos/charge";
import type { Integer } from "@/lib/shared/types";
import { formatMoney } from "@/lib/shared/utils/format";
import { clientBaseUrl } from "@/lib/shared/utils/window";

const createChargedPaymentQuery = (paymentId: Id) =>
	createQuery((db) =>
		db
			.selectFrom("payment")
			.leftJoin("paymentLnBridge", (join) =>
				join
					.onRef("paymentLnBridge.id", "=", "payment.id")
					.on("paymentLnBridge.isDeleted", "is not", sqliteTrue),
			)
			.leftJoin("paymentLnSpark", (join) =>
				join
					.onRef("paymentLnSpark.id", "=", "payment.id")
					.on("paymentLnSpark.isDeleted", "is not", sqliteTrue),
			)
			.leftJoin("paymentLnNwc", (join) =>
				join
					.onRef("paymentLnNwc.id", "=", "payment.id")
					.on("paymentLnNwc.isDeleted", "is not", sqliteTrue),
			)
			.leftJoin("paymentLnZap", (join) =>
				join
					.onRef("paymentLnZap.id", "=", "payment.id")
					.on("paymentLnZap.isDeleted", "is not", sqliteTrue),
			)
			.leftJoin("paymentBankTransferCZ", (join) =>
				join
					.onRef("paymentBankTransferCZ.id", "=", "payment.id")
					.on("paymentBankTransferCZ.isDeleted", "is not", sqliteTrue),
			)
			.leftJoin("paymentCash", (join) =>
				join
					.onRef("paymentCash.id", "=", "payment.id")
					.on("paymentCash.isDeleted", "is not", sqliteTrue),
			)
			.leftJoin("paymentWebData", (join) =>
				join
					.onRef("paymentWebData.id", "=", "payment.id")
					.on("paymentWebData.isDeleted", "is not", sqliteTrue),
			)
			.leftJoin("paymentWatchingState", (join) =>
				join
					.onRef("paymentWatchingState.id", "=", "payment.id")
					.on("paymentWatchingState.isDeleted", "is not", sqliteTrue),
			)
			.select(
				(eb) =>
					[
						"payment.id as id",
						"payment.totalAmount as totalAmount",
						"payment.currency as currency",
						eb.fn
							.coalesce(
								"paymentLnBridge.lnInvoice",
								"paymentLnSpark.lnInvoice",
								"paymentLnNwc.lnInvoice",
								"paymentLnZap.lnInvoice",
							)
							.as("lnInvoice"),
						eb.fn
							.coalesce(
								"paymentLnBridge.expirationIn",
								"paymentLnSpark.expirationIn",
								"paymentLnNwc.expirationIn",
								"paymentLnZap.expirationIn",
							)
							.as("expirationIn"),
						"paymentBankTransferCZ.iban as iban",
						"paymentBankTransferCZ.variableSymbol as variableSymbol",
						"paymentCash.accountId as cashAccountId",
						"paymentWebData.privateKey as webPrivateKey",
						"paymentWatchingState.id as watchingId",
						"paymentWatchingState.verifiedAt as verifiedAt",
						"paymentWatchingState.stoppedAt as stoppedAt",
						"paymentWatchingState.stopReason as stopReason",
						evoluJsonObjectFrom(
							eb
								.selectFrom("reconciliationClaim")
								.innerJoin(
									"reconciliationClaimAllocation",
									"reconciliationClaimAllocation.claimId",
									"reconciliationClaim.id",
								)
								.select(
									(eb) =>
										[
											eb.fn
												.sum<Integer | null>(
													"reconciliationClaimAllocation.amount",
												)
												.as("amount"),
										] as const,
								)
								.whereRef("reconciliationClaim.entityId", "=", "payment.id")
								.where("reconciliationClaim.isDeleted", "is not", sqliteTrue)
								.where(
									"reconciliationClaimAllocation.isDeleted",
									"is not",
									sqliteTrue,
								)
								.where("reconciliationClaim.entityType", "=", "payment"),
						).as("reconciliationClaim"),
					] as const,
			)
			.where("payment.isDeleted", "is not", sqliteTrue)
			.where("payment.id", "=", paymentId)
			.where("payment.totalAmount", "is not", null)
			.where("payment.currency", "is not", null)
			.$narrowType<{
				totalAmount: KyselyNotNull;
				currency: KyselyNotNull;
				reconciliationClaim: KyselyNotNull;
			}>(),
	);

type ChargeCode = {
	id: "lightning" | "bank" | "web";
	value: string;
};

const formatCountdown = (ms: number) => {
	const totalSeconds = Math.max(0, Math.floor(ms / 1000));
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;

	return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

const ChargeCodes: FC<{
	codes: ChargeCode[];
	size: number;
	takesCash: boolean;
}> = (props) => {
	const { t } = useTranslation();
	const [selected, setSelected] = useState<ChargeCode["id"] | undefined>();
	const first = props.codes[0];
	if (first === undefined) {
		return (
			<p className="text-center text-muted-foreground">
				{t(
					props.takesCash
						? "pos:bill.charge.cashOnly"
						: "pos:bill.charge.noCodes",
				)}
			</p>
		);
	}

	const code =
		props.codes.find((candidate) => candidate.id === selected) ?? first;
	const qr = (
		<div className="flex justify-center rounded bg-white p-4">
			<QRCodeSVG
				className="h-auto w-full"
				style={{ maxWidth: props.size }}
				size={props.size}
				value={code.value}
			/>
		</div>
	);
	if (props.codes.length === 1) {
		return qr;
	}

	return (
		<Tabs
			value={code.id}
			onValueChange={(value) => setSelected(value as ChargeCode["id"])}
			className="flex flex-col"
		>
			<TabsList className="w-full">
				{props.codes.map((candidate) => (
					<TabsTrigger key={candidate.id} value={candidate.id}>
						{t(`pos:bill.charge.codes.${candidate.id}`)}
					</TabsTrigger>
				))}
			</TabsList>
			<TabsContent value={code.id}>{qr}</TabsContent>
		</Tabs>
	);
};

export const PosCharge: FC<{
	bill: PosBill;
	paymentId: Id;
	label: string;
}> = (props) => {
	const { t } = useTranslation();
	const evolu = useEvolu();
	const { confirm } = useGlobalDialog();
	const { cancelCharge, recharge } = useChargeBill();
	const query = useMemo(
		() => createChargedPaymentQuery(props.paymentId),
		[props.paymentId],
	);
	const { data: payments } = useEvoluQuery(query);
	const payment = payments[0];
	const [now, setNow] = useState(() => Date.now());
	const [isFullscreen, setIsFullscreen] = useState(false);
	const [isWorking, startWorking] = useTransition();

	useEffect(() => {
		const tick = setInterval(() => setNow(Date.now()), 1000);

		return () => clearInterval(tick);
	}, []);

	const back = () =>
		cancelCharge({ billId: props.bill.id, paymentId: props.paymentId });

	if (payment === undefined) {
		return (
			<div className="flex flex-col gap-4">
				<p className="text-center text-muted-foreground">
					{t("pos:bill.charge.missing")}
				</p>
				<Button variant="outline" onClick={back}>
					<Undo2Icon />
					{t("pos:bill.charge.back")}
				</Button>
			</div>
		);
	}

	const expiresAt =
		payment.expirationIn === null ? null : payment.expirationIn * 1000;
	const state = resolveChargeState({
		paymentStatus: resolvePaymentStatus({
			payment: {
				totalAmount: payment.totalAmount,
				reconciliationClaim: { amount: payment.reconciliationClaim.amount },
			},
		}),
		expiresAt,
		watching:
			payment.watchingId === null
				? null
				: {
						verifiedAt: payment.verifiedAt,
						stoppedAt: payment.stoppedAt,
						stopReason: payment.stopReason,
					},
		now,
	});
	const codes: ChargeCode[] = [];
	if (payment.lnInvoice !== null) {
		codes.push({ id: "lightning", value: payment.lnInvoice });
	}
	if (payment.iban !== null && payment.variableSymbol !== null) {
		codes.push({
			id: "bank",
			value: generateCzechBankQrCode({
				amount: payment.totalAmount / 100,
				currency: payment.currency,
				iban: payment.iban,
				variableSymbol: payment.variableSymbol,
				useInstantPayment: true,
			}),
		});
	}
	if (payment.webPrivateKey !== null) {
		codes.push({
			id: "web",
			value: `${clientBaseUrl}#s-${payment.webPrivateKey}`,
		});
	}
	const amount = formatMoney({
		value: payment.totalAmount,
		currency: payment.currency,
	});
	const cashAccountId = payment.cashAccountId;

	const payInCash = async () => {
		if (cashAccountId === null) {
			return;
		}
		const accepted = await confirm({
			title: t("payments:detail.confirm.pay-in-cash.title"),
			description: t("payments:detail.confirm.pay-in-cash.description"),
			confirmText: t("payments:detail.actions.pay-in-cash"),
			cancelText: t("payments:detail.actions.cancel"),
		});
		if (!accepted) {
			return;
		}
		settlePaymentInCash({ evolu })({
			paymentId: props.paymentId,
			amount: payment.totalAmount,
			currency: payment.currency,
			cashAccountId,
		});
	};

	const retry = () => {
		startWorking(async () => {
			await recharge({
				billId: props.bill.id,
				paymentId: props.paymentId,
				currency: props.bill.currency,
				total: payment.totalAmount,
				items: props.bill.items.map((line) =>
					createPaymentItemFromBillLine(line),
				),
			});
		});
	};

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-start justify-between gap-2">
				<div>
					<p className="text-sm text-muted-foreground">{props.label}</p>
					<p className="text-2xl font-bold">{amount}</p>
				</div>
				<div className="flex items-center gap-2 text-sm font-medium">
					{state === ChargeState.Awaiting && (
						<LoaderCircleIcon className="size-4 animate-spin" />
					)}
					<span>
						{t(`pos:bill.charge.state.${state}`)}
						{state === ChargeState.Awaiting && expiresAt !== null
							? ` (${formatCountdown(expiresAt - now)})`
							: ""}
					</span>
				</div>
			</div>

			{state === ChargeState.Paid ? (
				<LoadingIndicator
					open={true}
					status="success"
					text={t("pos:bill.charge.state.paid")}
				/>
			) : state === ChargeState.Awaiting ? (
				<ChargeCodes
					codes={codes}
					size={256}
					takesCash={cashAccountId !== null}
				/>
			) : (
				<p className="text-center text-muted-foreground">
					{t(`pos:bill.charge.explain.${state}`)}
				</p>
			)}

			<div className="grid gap-2">
				{state === ChargeState.Awaiting && codes.length > 0 && (
					<Button variant="outline" onClick={() => setIsFullscreen(true)}>
						<FocusIcon />
						{t("pos:bill.charge.fullscreen")}
					</Button>
				)}
				{(state === ChargeState.Expired || state === ChargeState.Stopped) && (
					<Button onClick={retry} disabled={isWorking}>
						<RefreshCwIcon className={isWorking ? "animate-spin" : ""} />
						{t("pos:bill.charge.retry")}
					</Button>
				)}
				{state !== ChargeState.Paid && cashAccountId !== null && (
					<Button variant="outline" onClick={() => void payInCash()}>
						<CoinsIcon />
						{t("pos:bill.charge.cash")}
					</Button>
				)}
				{state !== ChargeState.Paid && (
					<Button variant="ghost" onClick={back} disabled={isWorking}>
						<Undo2Icon />
						{t("pos:bill.charge.back")}
					</Button>
				)}
			</div>

			<FullscreenDialog
				title={`${props.label} · ${amount}`}
				isOpen={isFullscreen}
				onOpenChange={setIsFullscreen}
			>
				<div className="flex h-full flex-col items-center justify-center py-4">
					<ChargeCodes
						codes={codes}
						size={512}
						takesCash={cashAccountId !== null}
					/>
				</div>
			</FullscreenDialog>
		</div>
	);
};
