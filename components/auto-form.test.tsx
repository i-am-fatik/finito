import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { FC } from "react";
import { type Control, useForm } from "react-hook-form";
import { z } from "zod";
import { AutoFormInput, createAutoFormLayout } from "@/components/auto-form";

const approvalStatuses = {
	pending: "Čeká na potvrzení",
	approved: "Potvrzeno",
};

const renderStatusField = (params: {
	allowEmpty: boolean;
	emptyTitle?: string;
	defaultValue: string | null;
}) => {
	const StatusField = AutoFormInput.select({
		label: "Stav",
		allowEmpty: params.allowEmpty,
		emptyTitle: params.emptyTitle,
		values: approvalStatuses,
	}) as unknown as FC<{ name: string; control: Control }>;

	const Harness = () => {
		const form = useForm({ defaultValues: { status: params.defaultValue } });

		return <StatusField name="status" control={form.control as never} />;
	};

	render(<Harness />);
};

const triggerText = () => screen.getByRole("combobox").textContent;

const pickOption = async (name: string) => {
	fireEvent.click(screen.getByRole("combobox"));
	const option = await screen.findByRole("option", { name });
	fireEvent.pointerEnter(option, { pointerType: "mouse" });
	fireEvent.mouseMove(option);
	fireEvent.click(option);
	await Promise.resolve();
};

afterEach(cleanup);

describe("AutoFormInput.select", () => {
	it("names the held value by its label, not by its key", () => {
		renderStatusField({ allowEmpty: false, defaultValue: "pending" });

		expect(triggerText()).toContain("Čeká na potvrzení");
		expect(triggerText()).not.toContain("pending");
	});

	it("names a newly picked value by its label", async () => {
		renderStatusField({ allowEmpty: false, defaultValue: "pending" });

		await pickOption("Potvrzeno");

		expect(triggerText()).toContain("Potvrzeno");
		expect(triggerText()).not.toContain("approved");
	});

	it("names an empty field by its empty title, not by the null sentinel", () => {
		renderStatusField({
			allowEmpty: true,
			emptyTitle: "Bez stavu",
			defaultValue: null,
		});

		expect(triggerText()).toContain("Bez stavu");
		expect(triggerText()).not.toContain("_");
	});
});

describe("arrayTableField in a narrow window", () => {
	const renderRates = () => {
		const schema = z.object({
			rates: z.object({ name: z.string() }).array(),
		});
		const components = createAutoFormLayout(schema, ({ builder }) => ({
			...builder.arrayTableField(
				{
					name: "rates",
					defaultValue: () => ({ name: "" }),
					columns: [{ title: "Název" }],
				},
				({ builder: rowBuilder }) => ({
					...rowBuilder.magicInput("name").text({}),
				}),
			),
		}));
		const RatesField = components.rates as unknown as FC<{
			name: string;
			control: Control;
		}>;

		const Harness = () => {
			const form = useForm({ defaultValues: { rates: [{ name: "DPH" }] } });

			return <RatesField name="rates" control={form.control as never} />;
		};

		return render(<Harness />).container;
	};

	it("keeps every row inside a table body, never loose in a div", () => {
		const container = renderRates();

		const rows = [...container.querySelectorAll("tr")];

		expect(rows.length).toBeGreaterThan(0);
		expect(rows.map((row) => row.parentElement?.tagName)).toEqual(
			rows.map(() => "TBODY"),
		);
	});
});
