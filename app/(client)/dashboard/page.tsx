"use client";

import {
	ArrowDownIcon,
	ArrowUpIcon,
	ContactIcon,
	MenuIcon,
	ScanQrCodeIcon,
} from "lucide-react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { FadeHeader } from "@/components/fade-header";
import { TransactionHistory } from "@/components/transaction-history";
import { Button } from "@/components/ui/button";
import { WalletBalance } from "@/components/wallet-balance";

const WalletStatus = () => (
	<FadeHeader
		startAddon={
			<Link href={"/contacts"}>
				<Button type={"button"} variant={"ghost"}>
					<ContactIcon className={"text-primary size-5"} strokeWidth={3} />
				</Button>
			</Link>
		}
		endAddon={
			<Link href={"/settings"}>
				<Button type={"button"} variant={"ghost"}>
					<MenuIcon className={"text-primary size-5"} strokeWidth={3} />
				</Button>
			</Link>
		}
		title={<WalletBalance />}
	/>
);

export default function Page() {
	const { t } = useTranslation();
	return (
		<div className="space-y-8 w-full p-4 flex flex-col">
			<div className={"h-18"} />
			<WalletStatus />
			<TransactionHistory />

			<div className="fixed bottom-8 left-0 right-0 flex justify-center ">
				<div className="bg-card border-t rounded-full shadow-[0_0_48px_rgba(0,0,0,0.1)] dark:shadow-[0_0_48px_rgba(0,0,0,0.6)] transition-all duration-400 flex justify-around gap-2 relative">
					<Link href={"/receive"}>
						<Button
							type={"button"}
							variant={"default"}
							className={
								"h-14 w-40 px-0 bg-transparent pr-4 text-foreground rounded-l-full text-md"
							}
						>
							<ArrowDownIcon
								className={"size-5 text-primary"}
								strokeWidth={3}
							/>
							{t("client:home.actions.receive")}
						</Button>
					</Link>
					<div
						className={
							"z-10 size-20 -my-3 -mx-8 bg-card border-t rounded-full shadow-[0_0_48px_rgba(0,0,0,0.1)] dark:shadow-[0_0_48px_rgba(0,0,0,0.4)]"
						}
					>
						<Link href={"/scan"}>
							<Button
								type={"button"}
								variant={"default"}
								className={`size-20 bg-transparent rounded-full`}
							>
								<ScanQrCodeIcon className={"size-8 text-primary"} />
							</Button>
						</Link>
					</div>
					<Link href={"/send" as never}>
						<Button
							type={"button"}
							variant={"default"}
							className={
								"h-14 w-40 px-0 bg-transparent pl-4 text-foreground rounded-r-full text-md"
							}
						>
							<ArrowUpIcon className={"size-5 text-primary"} strokeWidth={3} />
							{t("client:home.actions.send")}
						</Button>
					</Link>
				</div>
			</div>
		</div>
	);
}
