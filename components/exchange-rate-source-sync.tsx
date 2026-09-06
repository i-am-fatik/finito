"use client";

import { createIdFromString, sqliteTrue } from "@evolu/common";
import { useEffect } from "react";
import { useEvoluQuery } from "@/hooks/use-evolu-query";
import { createQuery } from "@/lib/evolu";
import { setPreferredExchangeRateSource } from "@/lib/integrations/currency-converter/currency-converter";

const exchangeRateSourceQuery = createQuery((db) =>
	db
		.selectFrom("billingSettings")
		.select(["billingSettings.exchangeRateSource as exchangeRateSource"])
		.where("billingSettings.isDeleted", "is not", sqliteTrue)
		.where("billingSettings.id", "=", createIdFromString("")),
);

export const ExchangeRateSourceSync = () => {
	const { data } = useEvoluQuery(exchangeRateSourceQuery);
	const source = data[0]?.exchangeRateSource ?? null;

	useEffect(() => {
		setPreferredExchangeRateSource(source);
	}, [source]);

	return null;
};
