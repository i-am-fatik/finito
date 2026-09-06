import { sha256 } from "@noble/hashes/sha2.js";
import { bech32, hex } from "@scure/base";

const paymentHashTag = 1;
const expiryTag = 6;
const descriptionTag = 13;
const timestampWordCount = 7;
const tagLengthWordCount = 2;
const signatureByteCount = 65;
const nanoBtcPerSat = 10;
const invoiceDescription = "finito test invoice";
const noChecksumLimit = Number.MAX_SAFE_INTEGER;

const toBigEndianWords = (value: number, wordCount: number) => {
	const words = new Array<number>(wordCount).fill(0);
	let rest = value;

	for (let index = wordCount - 1; index >= 0; index -= 1) {
		words[index] = rest % 32;
		rest = Math.floor(rest / 32);
	}

	return words;
};

const toShortestBigEndianWords = (value: number) => {
	const words: number[] = [];
	let rest = value;

	do {
		words.unshift(rest % 32);
		rest = Math.floor(rest / 32);
	} while (rest > 0);

	return words;
};

const taggedField = (tag: number, dataWords: number[]) => [
	tag,
	...toBigEndianWords(dataWords.length, tagLengthWordCount),
	...dataWords,
];

export const testLightningInvoice = (params: {
	amountSats: number;
	createdAtSec: number;
	expirySeconds: number;
	preimageSeed: string;
}) => {
	const preimage = sha256(new TextEncoder().encode(params.preimageSeed));
	const paymentHash = sha256(preimage);

	const words = [
		...toBigEndianWords(params.createdAtSec, timestampWordCount),
		...taggedField(paymentHashTag, bech32.toWords(paymentHash)),
		...taggedField(expiryTag, toShortestBigEndianWords(params.expirySeconds)),
		...taggedField(
			descriptionTag,
			bech32.toWords(new TextEncoder().encode(invoiceDescription)),
		),
		...bech32.toWords(new Uint8Array(signatureByteCount)),
	];

	return {
		lnInvoice: bech32.encode(
			`lnbc${params.amountSats * nanoBtcPerSat}n`,
			words,
			noChecksumLimit,
		),
		paymentHash: hex.encode(paymentHash),
		preimage: hex.encode(preimage),
		expiresAtSec: params.createdAtSec + params.expirySeconds,
	};
};

export const otherPreimageThan = (preimageSeed: string) =>
	hex.encode(sha256(new TextEncoder().encode(`${preimageSeed} mismatch`)));
