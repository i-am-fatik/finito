import {
	type Nip47Transaction,
	NWCWalletService,
	NWCWalletServiceKeyPair,
} from "@getalby/sdk/nwc";
import { hex } from "@scure/base";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { relayUrl } from "./nostr-relay";

type ReportedTransaction = {
	description: string;
	amountSats: number;
	paymentHash: string;
	invoice?: string;
};

const settledTransaction = (
	reported: ReportedTransaction,
): Nip47Transaction => {
	const nowSec = Math.floor(Date.now() / 1_000);

	return {
		type: "incoming",
		state: "settled",
		invoice: reported.invoice ?? "",
		description: reported.description,
		description_hash: "",
		preimage: "",
		payment_hash: reported.paymentHash,
		amount: reported.amountSats * 1_000,
		fees_paid: 0,
		created_at: nowSec,
		settled_at: nowSec,
		expires_at: nowSec + 3_600,
	};
};

export const nwcWalletOn = (url: string = relayUrl) => {
	const walletSecret = hex.encode(generateSecretKey());
	const clientSecret = hex.encode(generateSecretKey());
	const walletPubkey = getPublicKey(hex.decode(walletSecret));
	const clientPubkey = getPublicKey(hex.decode(clientSecret));
	const transactions: Nip47Transaction[] = [];

	let service: NWCWalletService | null = null;
	let unsubscribe: (() => void) | null = null;

	return {
		credentials: `nostr+walletconnect://${walletPubkey}?relay=${url}&secret=${clientSecret}`,
		report: (reported: ReportedTransaction) => {
			transactions.push(settledTransaction(reported));
		},
		open: async () => {
			service = new NWCWalletService({ relayUrl: url });
			await service.publishWalletServiceInfoEvent(
				walletSecret,
				["get_info", "list_transactions"],
				[],
			);
			unsubscribe = await service.subscribe(
				new NWCWalletServiceKeyPair(walletSecret, clientPubkey),
				{
					getInfo: async () => ({
						result: {
							alias: "E2E NWC Wallet",
							color: "",
							pubkey: walletPubkey,
							network: "regtest",
							block_height: 1,
							block_hash: "",
							methods: ["get_info", "list_transactions"],
							notifications: [],
						},
						error: undefined,
					}),
					listTransactions: async () => ({
						result: {
							transactions: [...transactions],
							total_count: transactions.length,
						},
						error: undefined,
					}),
				},
			);
		},
		close: () => {
			unsubscribe?.();
			service?.close();
		},
	};
};

export type NwcWallet = ReturnType<typeof nwcWalletOn>;
