"use client";

import { ViewTransition } from "react";
import { OnboardingGuard } from "@/components/onboarding-guard";
import { useBackgroundProcesses } from "@/hooks/use-background-processes";
import { useTableGuestWithoutAccount } from "@/hooks/use-table-guest";

const ClientLayoutShell = ({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) => (
	<div className="flex flex-col w-full justify-center flex-1 items-center">
		<ViewTransition>
			<div className="flex flex-1 w-full max-w-xl">{children}</div>

			<div className={"h-18 max-w-xl"}></div>
		</ViewTransition>
	</div>
);

const ClientLayoutContent = ({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) => {
	useBackgroundProcesses();

	return <ClientLayoutShell>{children}</ClientLayoutShell>;
};

export default function Layout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	if (useTableGuestWithoutAccount()) {
		return <ClientLayoutShell>{children}</ClientLayoutShell>;
	}

	return (
		<OnboardingGuard>
			<ClientLayoutContent>{children}</ClientLayoutContent>
		</OnboardingGuard>
	);
}
