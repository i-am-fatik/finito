import {
	evoluJsonArrayFrom,
	type Id,
	type KyselyNotNull,
	sqliteTrue,
} from "@evolu/common";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createQuery } from "@/lib/evolu";
import type { AiAgentScope } from "@/lib/evolu/model/ai-agent";
import { hashAgentToken, readBearerToken } from "@/lib/mcp/token";
import { type AgentToolDeps, registerAgentTools } from "@/lib/mcp/tools";
import { NonEmptyString, TimestampMs } from "@/lib/shared/types";

export type McpHttpRequest = {
	id: number;
	method: string;
	uri: string;
	headers: ReadonlyArray<readonly [string, string]>;
	body: string;
};

export type McpHttpResponse = {
	status: number;
	headers: Array<[string, string]>;
	body: string;
};

type Agent = {
	id: Id;
	label: string;
	lastUsedAt: number | null;
	scopes: ReadonlyArray<{ scope: AiAgentScope }>;
};

const serverInfo = { name: "finito", version: "0.1.0" };
const lastUsedAtResolutionMs = 5 * 60_000;
const bearerChallenge = 'Bearer realm="finito", error="invalid_token"';

const createAgentByTokenHashQuery = (tokenHash: NonEmptyString) =>
	createQuery((db) =>
		db
			.selectFrom("aiAgent")
			.select((eb) => [
				"aiAgent.id as id",
				"aiAgent.label as label",
				"aiAgent.lastUsedAt as lastUsedAt",
				evoluJsonArrayFrom(
					eb
						.selectFrom("aiAgentScope")
						.select(["aiAgentScope.scope as scope"])
						.whereRef("aiAgentScope.aiAgentId", "=", "aiAgent.id")
						.where("aiAgentScope.isDeleted", "is not", sqliteTrue)
						.where("aiAgentScope.scope", "is not", null)
						.$narrowType<{ scope: KyselyNotNull }>(),
				).as("scopes"),
			])
			.where("aiAgent.isDeleted", "is not", sqliteTrue)
			.where("aiAgent.tokenHash", "=", tokenHash)
			.where("aiAgent.label", "is not", null)
			.$narrowType<{ label: KyselyNotNull }>()
			.limit(1),
	);

const jsonRpcError = (
	status: number,
	code: number,
	message: string,
	extraHeaders: Array<[string, string]> = [],
): McpHttpResponse => ({
	status,
	headers: [["content-type", "application/json"], ...extraHeaders],
	body: JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }),
});

const unauthorized = (message: string) =>
	jsonRpcError(401, -32000, message, [["www-authenticate", bearerChallenge]]);

const parseJsonRpcBody = (
	body: string,
):
	| { kind: "invalid" }
	| { kind: "batch" }
	| { kind: "single"; value: unknown } => {
	try {
		const value: unknown = JSON.parse(body);

		return Array.isArray(value) ? { kind: "batch" } : { kind: "single", value };
	} catch {
		return { kind: "invalid" };
	}
};

const describeGrants = (label: string, scopes: ReadonlySet<AiAgentScope>) =>
	`You are connected to the finito POS as the agent "${label}" with these grants: ${[...scopes].join(", ")}. Amounts are decimal strings in major units of the named currency. Only the listed tools exist for you.`;

const touchLastUsedAt = (
	deps: AgentToolDeps & { now?: () => number },
	agent: Agent,
) => {
	const now = (deps.now ?? Date.now)();
	if (
		agent.lastUsedAt !== null &&
		now - agent.lastUsedAt < lastUsedAtResolutionMs
	) {
		return;
	}

	deps.evolu.update("aiAgent", { id: agent.id, lastUsedAt: TimestampMs(now) });
};

export const handleMcpHttpRequest =
	(deps: AgentToolDeps & { now?: () => number }) =>
	async (request: McpHttpRequest): Promise<McpHttpResponse> => {
		const token = readBearerToken(request.headers);
		if (token === null) {
			return unauthorized("Missing bearer token.");
		}
		const agents = await deps.evolu.loadQuery(
			createAgentByTokenHashQuery(NonEmptyString(hashAgentToken(token))),
		);
		const agent = agents[0];
		if (agent === undefined) {
			return unauthorized("Unknown or revoked token.");
		}

		const message = parseJsonRpcBody(request.body);
		if (message.kind === "invalid") {
			return jsonRpcError(400, -32700, "Parse error.");
		}
		if (message.kind === "batch") {
			return jsonRpcError(
				400,
				-32600,
				"Batches are not accepted, send one JSON-RPC message per request.",
			);
		}

		touchLastUsedAt(deps, agent);
		const scopes = new Set(agent.scopes.map((row) => row.scope));
		const server = new McpServer(serverInfo, {
			instructions: describeGrants(agent.label, scopes),
		});
		registerAgentTools(server, deps, scopes);
		const transport = new WebStandardStreamableHTTPServerTransport({
			sessionIdGenerator: undefined,
			enableJsonResponse: true,
		});
		await server.connect(transport);

		try {
			const response = await transport.handleRequest(
				new Request(`http://127.0.0.1${request.uri}`, {
					method: request.method,
					headers: Object.fromEntries(request.headers),
					body: request.body,
				}),
				{ parsedBody: message.value },
			);

			return {
				status: response.status,
				headers: [...response.headers.entries()],
				body: await response.text(),
			};
		} finally {
			await server.close();
		}
	};
