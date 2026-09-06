import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { act, cleanup, render, screen } from "@testing-library/react";
import Page from "@/app/admin/(private)/debug/errors/page";
import {
	clearDiagnostics,
	recordDiagnostic,
} from "@/lib/diagnostics/collector";

beforeEach(clearDiagnostics);
afterEach(cleanup);

describe("debug errors page", () => {
	it("says so while nothing was collected", () => {
		render(<Page />);

		expect(screen.getByText("admin:debug.errors.empty")).toBeInTheDocument();
	});

	it("lists what was collected newest first with level and repeat count", () => {
		recordDiagnostic({ level: "warning", source: "console", message: "older" });
		recordDiagnostic({ level: "error", source: "window", message: "newest" });
		recordDiagnostic({ level: "error", source: "window", message: "newest" });

		render(<Page />);
		const rows = screen.getAllByRole("listitem");

		expect(rows).toHaveLength(2);
		expect(rows[0]).toHaveTextContent("newest");
		expect(rows[0]).toHaveTextContent("error");
		expect(rows[0]).toHaveTextContent("admin:debug.errors.repeated");
		expect(rows[1]).toHaveTextContent("older");
		expect(rows[1]).not.toHaveTextContent("admin:debug.errors.repeated");
	});

	it("shows an error that arrives while the page is open", () => {
		render(<Page />);

		act(() => {
			recordDiagnostic({ level: "error", source: "promise", message: "late" });
		});

		expect(screen.getByText("late")).toBeInTheDocument();
		expect(screen.queryByText("admin:debug.errors.empty")).toBeNull();
	});
});
