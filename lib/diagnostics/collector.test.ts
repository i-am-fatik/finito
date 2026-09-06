import { beforeEach, describe, expect, it } from "bun:test";
import {
	clearDiagnostics,
	type DiagnosticEvent,
	diagnosticsCapacity,
	formatDiagnostics,
	installDiagnosticsCollector,
	readDiagnostics,
	recordDiagnostic,
	subscribeDiagnostics,
	watchEvoluErrors,
} from "@/lib/diagnostics/collector";

const storageKey = "finito.diagnostics";

const fakeStorage = (seed: Record<string, string> = {}) => {
	const map = new Map(Object.entries(seed));

	return {
		map,
		getItem: (key: string) => map.get(key) ?? null,
		setItem: (key: string, value: string) => {
			map.set(key, value);
		},
	};
};

const fakeConsole = () => {
	const calls: string[] = [];

	return {
		calls,
		error: (...args: unknown[]) => {
			calls.push(`error ${args.join(" ")}`);
		},
		warn: (...args: unknown[]) => {
			calls.push(`warn ${args.join(" ")}`);
		},
	};
};

const install = (
	options: Partial<Parameters<typeof installDiagnosticsCollector>[0]> = {},
) => {
	const console = fakeConsole();
	const uninstall = installDiagnosticsCollector({
		target: window,
		console,
		page: () => "/admin/pos",
		now: () => 1_760_000_000_000,
		...options,
	});

	return { console, uninstall };
};

const messages = () => readDiagnostics().map((event) => event.message);

beforeEach(() => {
	clearDiagnostics();
});

describe("diagnostics collector", () => {
	it("records console errors and warnings with their level and still lets the original console speak", () => {
		const { console, uninstall } = install();

		console.error("boom", new Error("broken"));
		console.warn("careful");

		expect(readDiagnostics().map((event) => event.level)).toEqual([
			"warning",
			"error",
		]);
		expect(readDiagnostics()[1]?.message).toContain("boom Error: broken");
		expect(readDiagnostics()[1]?.message).toMatch(/\n\s+at /);
		expect(console.calls).toEqual(["error boom Error: broken", "warn careful"]);

		uninstall();
		console.error("after");
		expect(messages()).not.toContain("after");
	});

	it("records window errors with their place and unhandled rejections with their reason", () => {
		const { uninstall } = install();

		window.dispatchEvent(
			new ErrorEvent("error", {
				message: "Cannot read x",
				filename: "app.js",
				lineno: 12,
				colno: 3,
			}),
		);
		window.dispatchEvent(
			Object.assign(new Event("unhandledrejection"), {
				reason: new Error("no answer"),
			}),
		);
		uninstall();
		window.dispatchEvent(new ErrorEvent("error", { message: "after" }));
		window.dispatchEvent(
			Object.assign(new Event("unhandledrejection"), { reason: "after" }),
		);

		expect(readDiagnostics().map((event) => event.source)).toEqual([
			"promise",
			"window",
		]);
		expect(readDiagnostics()[1]?.message).toBe("Cannot read x @ app.js:12:3");
		expect(readDiagnostics()[0]?.message).toContain("Error: no answer");
	});

	it("records a script that failed to load as a resource error", () => {
		const { uninstall } = install();
		const image = document.createElement("img");
		image.src = "http://localhost/missing.png";
		document.body.appendChild(image);

		image.dispatchEvent(new Event("error"));
		uninstall();
		image.remove();

		expect(readDiagnostics()[0]).toMatchObject({
			source: "resource",
			message: "Failed to load http://localhost/missing.png",
		});
	});

	it("collapses a repeated identical message into one entry with a count", () => {
		let now = 1_000;
		const { console, uninstall } = install({ now: () => now });

		console.error("same");
		now = 2_000;
		console.error("same");
		console.error("other");
		uninstall();

		expect(
			readDiagnostics().map((event) => [event.message, event.count]),
		).toEqual([
			["other", 1],
			["same", 2],
		]);
		expect(readDiagnostics()[1]?.at).toBe(2_000);
	});

	it("keeps only the newest entries once the capacity is reached", () => {
		for (let index = 0; index < diagnosticsCapacity + 5; index += 1) {
			recordDiagnostic({
				level: "error",
				source: "console",
				message: `message ${index}`,
			});
		}

		expect(readDiagnostics()).toHaveLength(diagnosticsCapacity);
		expect(messages()[0]).toBe(`message ${diagnosticsCapacity + 4}`);
		expect(messages()).not.toContain("message 4");
	});

	it("persists what it collected and reads a previous session back on install", () => {
		const first = fakeStorage();
		const { console, uninstall } = install({ storage: first });
		console.error("from this session");
		uninstall();
		expect(first.map.get(storageKey)).toContain("from this session");

		const stored: DiagnosticEvent = {
			id: 7,
			at: 5,
			level: "error",
			source: "window",
			message: "from last session",
			page: "/admin/pos",
			count: 3,
		};
		const second = install({
			storage: fakeStorage({ [storageKey]: JSON.stringify([stored]) }),
		});
		second.console.error("fresh");
		second.uninstall();

		expect(readDiagnostics().map((event) => [event.id, event.message])).toEqual(
			[
				[8, "fresh"],
				[7, "from last session"],
			],
		);
	});

	it("tells subscribers about the previous session as soon as it is read back", () => {
		let notified = 0;
		const unsubscribe = subscribeDiagnostics(() => {
			notified += 1;
		});
		const stored: DiagnosticEvent = {
			id: 1,
			at: 5,
			level: "error",
			source: "console",
			message: "from last session",
			page: "/admin",
			count: 1,
		};

		const { uninstall } = install({
			storage: fakeStorage({ [storageKey]: JSON.stringify([stored]) }),
		});
		uninstall();
		unsubscribe();

		expect(notified).toBe(1);
		expect(messages()).toEqual(["from last session"]);
	});

	it("skips the copy Evolu prints of an error the window already reported", () => {
		const { console, uninstall } = install();

		window.dispatchEvent(new ErrorEvent("error", { message: "once" }));
		console.error("error", { type: "UnknownError", error: new Error("once") });
		console.error("unhandledrejection", {
			type: "UnknownError",
			error: new Error("once"),
		});
		console.error("unhandledrejection", "not from evolu");
		console.error("error", { type: "SomethingElse" });
		uninstall();

		expect(
			readDiagnostics().map((event) => [event.source, event.message]),
		).toEqual([
			["console", 'error {\n  "type": "SomethingElse"\n}'],
			["console", "unhandledrejection not from evolu"],
			["window", "once"],
		]);
	});

	it("ignores stored garbage instead of failing to install", () => {
		const { uninstall } = install({
			storage: fakeStorage({ [storageKey]: "{not json" }),
		});
		uninstall();

		expect(readDiagnostics()).toEqual([]);
	});

	it("reports what the Evolu error store holds", () => {
		let current: unknown = null;
		let listener = () => {};
		const unsubscribe = watchEvoluErrors({
			subscribe: (next) => {
				listener = next;
				return () => {
					listener = () => {};
				};
			},
			get: () => current,
		});

		listener();
		current = { type: "TimestampError", error: new Error("clock") };
		listener();
		unsubscribe();
		listener();

		expect(readDiagnostics()).toHaveLength(1);
		expect(readDiagnostics()[0]).toMatchObject({ source: "evolu" });
		expect(readDiagnostics()[0]?.message).toContain("TimestampError");
		expect(readDiagnostics()[0]?.message).toContain("clock");
	});

	it("hands every record to the sink without recording what the sink says", () => {
		const forwarded: string[] = [];
		const { console, uninstall } = install({
			sink: (event) => {
				forwarded.push(`${event.level} ${event.message}`);
				console.error("sink talking");
			},
		});

		console.error("real");
		console.warn("soft");
		uninstall();

		expect(forwarded).toEqual(["error real", "warning soft"]);
		expect(messages()).toEqual(["soft", "real"]);
	});

	it("notifies subscribers and formats a copyable dump", () => {
		let notified = 0;
		const unsubscribe = subscribeDiagnostics(() => {
			notified += 1;
		});
		const { console, uninstall } = install();

		console.error("one");
		console.error("one");
		unsubscribe();
		console.error("two");
		uninstall();

		expect(notified).toBe(2);
		expect(formatDiagnostics(readDiagnostics())).toBe(
			"2025-10-09T08:53:20.000Z error console /admin/pos\ntwo\n\n2025-10-09T08:53:20.000Z error console /admin/pos ×2\none",
		);
	});
});
