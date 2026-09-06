import { describe, expect, it } from "bun:test";
import {
	agentTokenPattern,
	createAgentToken,
	hashAgentToken,
	readBearerToken,
} from "@/lib/mcp/token";

describe("createAgentToken", () => {
	it("mints a prefixed 256-bit token that the listener shape check accepts", () => {
		const token = createAgentToken();

		expect(token).toMatch(agentTokenPattern);
		expect(token).toHaveLength("finito_mcp_".length + 64);
	});

	it("never mints the same token twice", () => {
		expect(createAgentToken()).not.toBe(createAgentToken());
	});
});

describe("hashAgentToken", () => {
	it("is a stable hex sha256 that does not contain the token", () => {
		const token = createAgentToken();
		const hash = hashAgentToken(token);

		expect(hash).toBe(hashAgentToken(token));
		expect(hash).toMatch(/^[0-9a-f]{64}$/);
		expect(hash).not.toContain(token.slice("finito_mcp_".length, 40));
		expect(hashAgentToken(`finito_mcp_${"1".repeat(64)}`)).not.toBe(
			hashAgentToken(`finito_mcp_${"1".repeat(63)}2`),
		);
		expect(hashAgentToken("finito_mcp_abc")).toBe(
			"c3572b13a3b218008540b8a6abcba8b9dba39e4243296ba635484286460ee585",
		);
	});
});

describe("readBearerToken", () => {
	const token = `finito_mcp_${"7b".repeat(32)}`;

	it("reads a well-formed bearer token regardless of header name case", () => {
		expect(readBearerToken([["Authorization", `Bearer ${token}`]])).toBe(token);
		expect(readBearerToken([["authorization", `Bearer ${token}`]])).toBe(token);
	});

	it("rejects a missing header, another scheme and a token of the wrong shape", () => {
		expect(readBearerToken([])).toBeNull();
		expect(readBearerToken([["authorization", `Digest ${token}`]])).toBeNull();
		expect(readBearerToken([["authorization", "Bearer sk-1234"]])).toBeNull();
		expect(
			readBearerToken([["authorization", `Bearer ${token.toUpperCase()}`]]),
		).toBeNull();
	});
});
