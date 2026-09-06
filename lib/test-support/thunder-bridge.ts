import { GatewayCheatError, preimageMatchesHash } from "thunder-bridge";

const realGatewayCheatError = GatewayCheatError;
const realPreimageMatchesHash = preimageMatchesHash;

export const thunderBridgeModuleWith = (ThunderBridge: unknown) => () => ({
	ThunderBridge,
	GatewayCheatError: realGatewayCheatError,
	preimageMatchesHash: realPreimageMatchesHash,
});
