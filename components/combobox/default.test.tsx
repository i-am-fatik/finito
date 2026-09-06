import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ComboboxDefault } from "@/components/combobox/default";

type TableOption = { id: string; revision?: number };

const tableOptions = [
	{ value: { id: "table-1" } as TableOption, label: "Stůl 1" },
	{ value: { id: "table-2" } as TableOption, label: "Stůl 2" },
];

const renderTableCombobox = (
	value: TableOption | null,
	overrides?: Partial<Parameters<typeof ComboboxDefault<TableOption>>[0]> & {
		open?: boolean;
	},
) => {
	const chosen: Array<TableOption | null> = [];

	render(
		<ComboboxDefault<TableOption>
			items={tableOptions}
			value={value}
			onChange={(next) => chosen.push(next)}
			formatCustomValue={(option) => `Neznámý stůl ${option.id}`}
			{...overrides}
		/>,
	);

	if (overrides?.open !== false) {
		fireEvent.click(screen.getAllByRole("combobox")[0]);
	}

	return { chosen };
};

const searchFor = (text: string) => {
	fireEvent.change(screen.getByPlaceholderText("Search item..."), {
		target: { value: text },
	});
};

const optionLabels = () =>
	screen.getAllByRole("option").map((option) => option.textContent);

const triggerLabel = () => screen.getAllByRole("combobox")[0].textContent;

afterEach(cleanup);

describe("ComboboxDefault", () => {
	it("filters items by their label", () => {
		renderTableCombobox(null);

		searchFor("Stůl 2");

		expect(optionLabels()).toEqual(["Stůl 2"]);
	});

	it("finds nothing for text that matches no label", () => {
		renderTableCombobox(null);

		searchFor("Terasa");

		expect(screen.queryAllByRole("option")).toHaveLength(0);
		expect(screen.getByText("No item found.")).toBeInTheDocument();
	});

	it("lists a selected object value once", () => {
		renderTableCombobox({ id: "table-1" });

		expect(optionLabels()).toEqual(["Stůl 1", "Stůl 2"]);
	});

	it("adds a value that is not among the items once", () => {
		renderTableCombobox({ id: "table-9" });

		expect(optionLabels()).toEqual([
			"Neznámý stůl table-9",
			"Stůl 1",
			"Stůl 2",
		]);
	});

	it("hands back the value of the row the user picked, not the row at that position in the unfiltered list", () => {
		const { chosen } = renderTableCombobox(null);

		searchFor("Stůl 2");
		screen.getByRole("option").click();

		expect(chosen).toEqual([{ id: "table-2" }]);
	});

	it("hands back the value of a plainly picked row", () => {
		const { chosen } = renderTableCombobox(null);

		screen.getAllByRole("option")[0].click();

		expect(chosen).toEqual([{ id: "table-1" }]);
	});

	it("clears the selection to null", () => {
		const { chosen } = renderTableCombobox({ id: "table-1" }, { open: false });

		fireEvent.click(screen.getAllByRole("button")[0]);

		expect(chosen).toEqual([null]);
	});

	it("asks the caller's compareFunction which row is the selected one, not whether the objects are identical", () => {
		renderTableCombobox({ id: "table-1", revision: 2 } as TableOption, {
			compareFunction: (a, b) => a?.id === b?.id,
		});

		expect(optionLabels()).toEqual(["Stůl 1", "Stůl 2"]);
		expect(triggerLabel()).toContain("Stůl 1");
	});

	it("shows the selected row's label on the trigger", () => {
		renderTableCombobox({ id: "table-2" }, { open: false });

		expect(triggerLabel()).toContain("Stůl 2");
	});

	it("shows the placeholder while nothing is selected", () => {
		renderTableCombobox(null, { placeholder: "Vyberte stůl", open: false });

		expect(triggerLabel()).toContain("Vyberte stůl");
	});
});
