import { describe, expect, it } from "bun:test";
import { sha256 } from "@noble/hashes/sha2.js";
import { hex } from "@scure/base";
import { decode } from "light-bolt11-decoder";
import { testLightningInvoice } from "@/lib/test-support/bolt11";

const sectionValue = (invoice: string, name: string) => {
	const section = decode(invoice).sections.find(
		(candidate) => candidate.name === name,
	);

	return section !== undefined && "value" in section
		? section.value
		: undefined;
};

describe("testLightningInvoice", () => {
	it("carries the amount a wallet would be asked for", () => {
		const { lnInvoice } = testLightningInvoice({
			amountSats: 12_000,
			createdAtSec: 1_700_000_000,
			expirySeconds: 3_600,
			preimageSeed: "amount",
		});

		expect(sectionValue(lnInvoice, "amount")).toBe("12000000");
	});

	it("carries a payment hash the preimage hashes to", () => {
		const { lnInvoice, paymentHash, preimage } = testLightningInvoice({
			amountSats: 1,
			createdAtSec: 1_700_000_000,
			expirySeconds: 3_600,
			preimageSeed: "hash",
		});

		expect(sectionValue(lnInvoice, "payment_hash")).toBe(paymentHash);
		expect(hex.encode(sha256(hex.decode(preimage)))).toBe(paymentHash);
	});

	it("describes itself in words when no description hash is asked for", () => {
		const { lnInvoice } = testLightningInvoice({
			amountSats: 1,
			createdAtSec: 1_700_000_000,
			expirySeconds: 3_600,
			preimageSeed: "description",
		});

		expect(sectionValue(lnInvoice, "description")).toBeDefined();
		expect(sectionValue(lnInvoice, "description_hash")).toBeUndefined();
	});

	it("commits to the payRequest metadata when a description hash is asked for", () => {
		const descriptionHash = hex.encode(
			sha256(new TextEncoder().encode('[["text/plain","finito"]]')),
		);
		const { lnInvoice } = testLightningInvoice({
			amountSats: 1,
			createdAtSec: 1_700_000_000,
			expirySeconds: 3_600,
			preimageSeed: "commit",
			descriptionHash,
		});

		expect(sectionValue(lnInvoice, "description_hash")).toBe(descriptionHash);
		expect(sectionValue(lnInvoice, "description")).toBeUndefined();
	});

	it("expires when the invoice says it does", () => {
		const { lnInvoice, expiresAtSec } = testLightningInvoice({
			amountSats: 1,
			createdAtSec: 1_700_000_000,
			expirySeconds: 600,
			preimageSeed: "expiry",
		});

		expect(sectionValue(lnInvoice, "expiry")).toBe(600);
		expect(expiresAtSec).toBe(1_700_000_600);
	});
});
