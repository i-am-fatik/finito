import { describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import adminManifest from "@/app/admin/manifest";
import appManifest from "@/app/manifest";

describe("web manifests", () => {
	it("ship every icon they point at", () => {
		for (const manifest of [appManifest(), adminManifest()]) {
			const icons = manifest.icons ?? [];
			expect(icons.length).toBeGreaterThan(0);
			for (const icon of icons) {
				expect(existsSync(join(process.cwd(), "public", icon.src))).toBe(true);
			}
		}
	});
});
