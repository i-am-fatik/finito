import { describe, expect, it } from "bun:test";
import {
	createGatewayCheck,
	describeGatewayProblem,
	GatewayProblemKind,
	gatewayCheckAmountMsat,
} from "@/lib/payment/gateway";

const problemError = (props: {
	status?: number;
	type?: string;
	title?: string;
	detail?: string;
}) => Object.assign(new Error(props.title ?? "Request failed"), props);

describe("describeGatewayProblem", () => {
	it("reads a refused token out of a 401", () => {
		expect(describeGatewayProblem(problemError({ status: 401 }))).toEqual({
			kind: GatewayProblemKind.Unauthorized,
			status: 401,
			detail: "Request failed",
		});
	});

	it("reads a refused token out of a 403", () => {
		expect(describeGatewayProblem(problemError({ status: 403 })).kind).toBe(
			GatewayProblemKind.Unauthorized,
		);
	});

	it("lets the no wallet type win over the status it came with", () => {
		const problem = describeGatewayProblem(
			problemError({
				status: 404,
				type: "urn:problem-type:thunder-bridge:no-wallet-available",
			}),
		);

		expect(problem.kind).toBe(GatewayProblemKind.NoWallet);
		expect(problem.status).toBe(404);
	});

	it("keeps any other status as a refusal and carries what the gateway said", () => {
		expect(
			describeGatewayProblem(
				problemError({ status: 500, title: "Boom", detail: "wallet exploded" }),
			),
		).toEqual({
			kind: GatewayProblemKind.Refused,
			status: 500,
			detail: "wallet exploded",
		});
	});

	it("reads a failed fetch as an unreachable gateway", () => {
		expect(describeGatewayProblem(new TypeError("Load failed"))).toEqual({
			kind: GatewayProblemKind.Unreachable,
			status: null,
			detail: "Load failed",
		});
	});

	it("leaves a TypeError that names no network failure as unknown, so a bug does not read as a dead gateway", () => {
		expect(
			describeGatewayProblem(new TypeError("evolu.loadQuery is not a function"))
				.kind,
		).toBe(GatewayProblemKind.Unknown);
	});

	it("falls back to unknown for anything carrying no status", () => {
		expect(describeGatewayProblem(new Error("who knows")).kind).toBe(
			GatewayProblemKind.Unknown,
		);
	});

	it("prefers the detail over the title", () => {
		expect(
			describeGatewayProblem(
				problemError({
					status: 401,
					title: "Unauthorized",
					detail: "no token",
				}),
			).detail,
		).toBe("no token");
	});
});

describe("createGatewayCheck", () => {
	it("probes with ten sats so a wallet minimum does not read as a broken gateway", () => {
		expect(gatewayCheckAmountMsat).toBe(10_000);
	});

	it("passes when the gateway quotes the address", async () => {
		const asked: Array<Record<string, unknown>> = [];
		const check = createGatewayCheck({
			quote: async (params) => {
				asked.push(params);

				return { lnAddress: "iamfatik@blink.sv" };
			},
		});

		expect(
			await check({
				gatewayUrl: "https://gateway.invalid",
				gatewayToken: "secret",
				lud16: "iamfatik@blink.sv",
			}),
		).toEqual({ ok: true, lnAddress: "iamfatik@blink.sv" });
		expect(asked).toEqual([
			{
				gatewayUrl: "https://gateway.invalid",
				gatewayToken: "secret",
				lud16: "iamfatik@blink.sv",
				amountMsat: 10_000,
			},
		]);
	});

	it("reports the reason the gateway gave instead of throwing", async () => {
		const check = createGatewayCheck({
			quote: async () => {
				throw problemError({ status: 401, detail: "no token" });
			},
		});

		expect(
			await check({
				gatewayUrl: "https://gateway.invalid",
				gatewayToken: null,
				lud16: "iamfatik@blink.sv",
			}),
		).toEqual({
			ok: false,
			problem: {
				kind: GatewayProblemKind.Unauthorized,
				status: 401,
				detail: "no token",
			},
		});
	});
});
