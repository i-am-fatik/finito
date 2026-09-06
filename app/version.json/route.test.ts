import { afterEach, describe, expect, it } from "bun:test";
import { z } from "zod";
import { GET } from "@/app/version.json/route";

const payloadSchema = z.object({ version: z.string(), builtAt: z.string() });
const originalCommit = process.env.NEXT_PUBLIC_GIT_COMMIT;

afterEach(() => {
	if (originalCommit === undefined) {
		delete process.env.NEXT_PUBLIC_GIT_COMMIT;
	} else {
		process.env.NEXT_PUBLIC_GIT_COMMIT = originalCommit;
	}
});

describe("GET /version.json", () => {
	it("publishes the commit the running build was made from", async () => {
		process.env.NEXT_PUBLIC_GIT_COMMIT = "abc1234";

		const payload = payloadSchema.parse(await GET().json());

		expect(payload.version).toBe("abc1234");
		expect(Number.isNaN(Date.parse(payload.builtAt))).toBe(false);
	});

	it("answers with the same placeholder the toast uses when a build has no commit", async () => {
		delete process.env.NEXT_PUBLIC_GIT_COMMIT;

		const payload = payloadSchema.parse(await GET().json());

		expect(payload.version).toBe("unknown");
	});
});
