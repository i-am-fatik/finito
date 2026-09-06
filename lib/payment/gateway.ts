import { ThunderBridge } from "thunder-bridge";
import type { NonNegativeInteger } from "@/lib/shared/types";

export const GatewayProblemKind = {
	Unauthorized: "unauthorized",
	Unreachable: "unreachable",
	NoWallet: "noWallet",
	Refused: "refused",
	Unknown: "unknown",
} as const;

export type GatewayProblemKind =
	(typeof GatewayProblemKind)[keyof typeof GatewayProblemKind];

export type GatewayProblem = {
	kind: GatewayProblemKind;
	status: number | null;
	detail: string | null;
};

const noWalletAvailable = "urn:problem-type:thunder-bridge:no-wallet-available";

const failedToReach = /fetch|network|load failed|connection refused/i;

const readNumber = (value: unknown) =>
	typeof value === "number" && Number.isFinite(value) ? value : null;

const readText = (value: unknown) =>
	typeof value === "string" && value.length > 0 ? value : null;

const readProperty = (error: unknown, key: string): unknown =>
	typeof error === "object" && error !== null && key in error
		? (error as Record<string, unknown>)[key]
		: undefined;

export const describeGatewayProblem = (error: unknown): GatewayProblem => {
	const status = readNumber(readProperty(error, "status"));
	const detail =
		readText(readProperty(error, "detail")) ??
		readText(readProperty(error, "title")) ??
		readText(readProperty(error, "message"));

	if (readProperty(error, "type") === noWalletAvailable) {
		return { kind: GatewayProblemKind.NoWallet, status, detail };
	}

	if (status === 401 || status === 403) {
		return { kind: GatewayProblemKind.Unauthorized, status, detail };
	}

	if (status !== null && status > 0) {
		return { kind: GatewayProblemKind.Refused, status, detail };
	}

	if (
		readProperty(error, "name") === "TypeError" &&
		detail !== null &&
		failedToReach.test(detail)
	) {
		return { kind: GatewayProblemKind.Unreachable, status: null, detail };
	}

	return { kind: GatewayProblemKind.Unknown, status, detail };
};

export type GatewayCheck =
	| { ok: true; lnAddress: string }
	| { ok: false; problem: GatewayProblem };

export type GatewayCheckDeps = {
	quote: (params: {
		gatewayUrl: string;
		gatewayToken: string | null;
		lud16: string;
		amountMsat: number;
	}) => Promise<{ lnAddress: string }>;
};

export const quoteThroughBridge: GatewayCheckDeps["quote"] = async (params) =>
	await new ThunderBridge(params.gatewayUrl, {
		token: params.gatewayToken ?? undefined,
	}).createQuote({
		lnAddresses: [params.lud16],
		amountMsat: params.amountMsat,
	});

export const gatewayCheckAmountMsat = 10_000;

export const createGatewayCheck =
	(deps: GatewayCheckDeps) =>
	async (params: {
		gatewayUrl: string;
		gatewayToken: string | null;
		lud16: string;
		amountMsat?: NonNegativeInteger;
	}): Promise<GatewayCheck> => {
		try {
			const quote = await deps.quote({
				gatewayUrl: params.gatewayUrl,
				gatewayToken: params.gatewayToken,
				lud16: params.lud16,
				amountMsat: Number(params.amountMsat ?? gatewayCheckAmountMsat),
			});

			return { ok: true, lnAddress: quote.lnAddress };
		} catch (error) {
			return { ok: false, problem: describeGatewayProblem(error) };
		}
	};
