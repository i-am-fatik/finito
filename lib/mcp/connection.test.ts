import { describe, expect, it } from "bun:test";
import {
	claudeCodeCommand,
	claudeDesktopConfig,
	mcpEndpointUrl,
} from "@/lib/mcp/connection";

const token = `finito_mcp_${"5d".repeat(32)}`;

describe("connection snippets", () => {
	it("points at the loopback endpoint on the listener port", () => {
		expect(mcpEndpointUrl(41414)).toBe("http://127.0.0.1:41414/mcp");
	});

	it("gives Claude Code an http transport with the bearer header", () => {
		expect(claudeCodeCommand({ port: 41414, token })).toBe(
			`claude mcp add --transport http finito http://127.0.0.1:41414/mcp --header "Authorization: Bearer ${token}"`,
		);
	});

	it("gives Claude Desktop an mcp-remote bridge that carries the same header", () => {
		const config = JSON.parse(claudeDesktopConfig({ port: 41414, token })) as {
			mcpServers: { finito: { command: string; args: string[] } };
		};

		expect(config.mcpServers.finito.command).toBe("npx");
		expect(config.mcpServers.finito.args).toEqual([
			"-y",
			"mcp-remote",
			"http://127.0.0.1:41414/mcp",
			"--allow-http",
			"--header",
			`Authorization: Bearer ${token}`,
		]);
	});
});
