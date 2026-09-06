import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, randomBytes, utf8ToBytes } from "@noble/hashes/utils.js";

const agentTokenPrefix = "finito_mcp_";
const bearerPrefix = "Bearer ";

export const agentTokenPattern = /^finito_mcp_[0-9a-f]{64}$/;

export const createAgentToken = () =>
	`${agentTokenPrefix}${bytesToHex(randomBytes(32))}`;

export const hashAgentToken = (token: string) =>
	bytesToHex(sha256(utf8ToBytes(token)));

export const readBearerToken = (
	headers: ReadonlyArray<readonly [string, string]>,
) => {
	const authorization =
		headers.find(([name]) => name.toLowerCase() === "authorization")?.[1] ?? "";
	const token = authorization.startsWith(bearerPrefix)
		? authorization.slice(bearerPrefix.length)
		: "";

	return agentTokenPattern.test(token) ? token : null;
};
