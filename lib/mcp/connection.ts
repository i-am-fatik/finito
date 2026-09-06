export const defaultMcpPort = 41414;

export const mcpEndpointUrl = (port: number) => `http://127.0.0.1:${port}/mcp`;

export const claudeCodeCommand = (params: { port: number; token: string }) =>
	`claude mcp add --transport http finito ${mcpEndpointUrl(params.port)} --header "Authorization: Bearer ${params.token}"`;

export const claudeDesktopConfig = (params: { port: number; token: string }) =>
	JSON.stringify(
		{
			mcpServers: {
				finito: {
					command: "npx",
					args: [
						"-y",
						"mcp-remote",
						mcpEndpointUrl(params.port),
						"--allow-http",
						"--header",
						`Authorization: Bearer ${params.token}`,
					],
				},
			},
		},
		null,
		2,
	);
