import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ComboboxDefault } from "@/components/combobox/default";

type TableOption = { id: string };

const tableOptions = [
	{ value: { id: "table-1" } as TableOption, label: "Stůl 1" },
	{ value: { id: "table-2" } as TableOption, label: "Stůl 2" },
];

const renderTableCombobox = (value: TableOption | null) => {
	render(
		<ComboboxDefault<TableOption>
			items={tableOptions}
			value={value}
			formatCustomValue={(option) => `Neznámý stůl ${option.id}`}
		/>,
	);

	fireEvent.click(screen.getByRole("combobox"));
};

const searchFor = (text: string) => {
	fireEvent.change(screen.getByPlaceholderText("Search item..."), {
		target: { value: text },
	});
};

const optionLabels = () =>
	screen.getAllByRole("option").map((option) => option.textContent);

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
});
