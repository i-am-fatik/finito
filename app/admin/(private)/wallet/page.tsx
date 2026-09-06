"use client";

import { ArrowDownIcon, ArrowUpIcon, ScanQrCodeIcon } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { TransactionHistory } from "@/components/transaction-history";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { WalletBalance } from "@/components/wallet-balance";

export default function Page() {
	const { t } = useTranslation();

	return (
		<div className="w-full max-w-xl mx-auto p-4 flex flex-col gap-8">
			<Card>
				<CardContent className="flex flex-col gap-4">
					<WalletBalance />
					<div className="flex justify-center gap-2 flex-wrap">
						<Link href={"/receive"}>
							<Button type={"button"} variant={"outline"}>
								<ArrowDownIcon
									className={"size-5 text-primary"}
									strokeWidth={3}
								/>
								{t("client:home.actions.receive")}
							</Button>
						</Link>
						<Link href={"/scan"}>
							<Button type={"button"} variant={"outline"}>
								<ScanQrCodeIcon
									className={"size-5 text-primary"}
									strokeWidth={3}
								/>
								{t("client:page.scanQrCode")}
							</Button>
						</Link>
						<Link href={"/send" as never}>
							<Button type={"button"} variant={"outline"}>
								<ArrowUpIcon
									className={"size-5 text-primary"}
									strokeWidth={3}
								/>
								{t("client:home.actions.send")}
							</Button>
						</Link>
					</div>
				</CardContent>
			</Card>
			<TransactionHistory
				detailHref={(paymentId) =>
					`/admin/payments/detail?id=${encodeURIComponent(paymentId)}`
				}
			/>
		</div>
	);
}
