import { preimageMatchesHash } from "thunder-bridge";

const realPreimageMatchesHash = preimageMatchesHash;

export const thunderBridgeModuleWith = (ThunderBridge: unknown) => () => ({
	ThunderBridge,
	preimageMatchesHash: realPreimageMatchesHash,
});
