import { createIdFromString } from "@evolu/common";
import { sha256 } from "@noble/hashes/sha2.js";
import { PaymentDefaultMethodType } from "@/lib/evolu/model/payment-default-method";

export const defaultAccountIds = (mnemonic: string) => {
	const hash = sha256(new TextEncoder().encode(mnemonic));
	const sparkAccountId = createIdFromString(
		Array.from(hash)
			.map((byte) => byte.toString(16).padStart(2, "0"))
			.join(""),
	);
	const cashRegisterAccountId = createIdFromString(
		`${sparkAccountId}:cashRegister`,
	);

	return {
		sparkAccountId,
		cashRegisterAccountId,
		sparkPaymentDefaultMethodId: createIdFromString(
			`${sparkAccountId}:paymentDefaultMethod:${PaymentDefaultMethodType.BtcLn}`,
		),
		cashRegisterPaymentDefaultMethodId: createIdFromString(
			`${cashRegisterAccountId}:paymentDefaultMethod:${PaymentDefaultMethodType.Cash}`,
		),
	};
};
