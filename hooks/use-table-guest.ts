"use client";

import { useAtomValue } from "jotai";
import { hasDeviceAccountAtom } from "@/atoms/account";
import { useHash } from "@/hooks/use-hash";
import { tableBillIdPrefix } from "@/lib/bill/drivers/table-driver";

export const useTableGuestWithoutAccount = () => {
	const hash = useHash();
	const hasAccount = useAtomValue(hasDeviceAccountAtom);

	return !hasAccount && hash !== null && hash.startsWith(tableBillIdPrefix);
};
