import type { Id } from "@evolu/common";
import { VariableSymbol } from "@/lib/shared/types";

export const variableSymbolForPayment = (paymentId: Id): VariableSymbol => {
	let hash = 2_166_136_261;

	for (const character of paymentId) {
		hash ^= character.charCodeAt(0);
		hash = Math.imul(hash, 16_777_619);
	}

	return VariableSymbol(`${hash >>> 0}`);
};
