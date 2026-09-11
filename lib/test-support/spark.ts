import { SparkWalletEvent } from "@buildonspark/spark-sdk";

const realSparkWalletEvent = SparkWalletEvent;

export const sparkSdkModuleWith = (SparkWallet: unknown) => () => ({
	SparkWallet,
	SparkWalletEvent: realSparkWalletEvent,
});
