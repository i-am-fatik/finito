"use client";

import { ReceiptTextIcon } from "lucide-react";
import Link from "next/link";
import { type FC, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { usePosClosedBills } from "@/hooks/use-pos";
import {
	formatDateTime,
	formatMoney,
	formatTime,
} from "@/lib/shared/utils/format";

const formatClosedAt = (closedAt: number, now: Date) => {
	const value = new Date(closedAt);

	return value.toDateString() === now.toDateString()
		? formatTime(value)
		: formatDateTime(value);
};

export const PosClosedBills: FC = () => {
	const { t } = useTranslation();
	const [isOpen, setIsOpen] = useState(false);
	const closedBills = usePosClosedBills();
	const now = new Date();

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger render={<Button size="lg" variant="ghost" />}>
				<ReceiptTextIcon />
				{t("pos:closed.open")}
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t("pos:closed.title")}</DialogTitle>
				</DialogHeader>
				{closedBills.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						{t("pos:closed.empty")}
					</p>
				) : (
					<ul className="divide-y">
						{closedBills.map((bill) => (
							<li
								key={bill.id}
								className="flex flex-wrap items-center justify-between gap-2 py-2"
							>
								<div className="min-w-0">
									<p className="truncate font-medium">
										{bill.tableLabel ?? bill.label ?? `#${bill.displayId}`}
									</p>
									<p className="text-xs text-muted-foreground">
										{formatClosedAt(bill.closedAt, now)}
									</p>
								</div>
								<span className="font-bold">
									{formatMoney({
										value: bill.totalAmount,
										currency: bill.currency,
									})}
								</span>
								<div className="flex gap-1">
									<Button
										size="sm"
										variant="outline"
										nativeButton={false}
										render={
											<Link
												href={
													`/admin/payments/bills/detail?id=${encodeURIComponent(bill.id)}` as never
												}
											/>
										}
									>
										{t("pos:closed.bill")}
									</Button>
									{bill.paymentId !== null && (
										<Button
											size="sm"
											variant="outline"
											nativeButton={false}
											render={
												<Link
													href={
														`/admin/payments/detail?id=${encodeURIComponent(bill.paymentId)}` as never
													}
												/>
											}
										>
											{t("pos:closed.payment")}
										</Button>
									)}
								</div>
							</li>
						))}
					</ul>
				)}
			</DialogContent>
		</Dialog>
	);
};
