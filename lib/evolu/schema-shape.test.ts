import { describe, expect, it } from "bun:test";
import { AppSchema } from "@/lib/evolu";
import { TableIdSchema } from "@/lib/evolu/types";

const shapeOf = (schema: Record<string, Record<string, unknown>>) =>
	Object.fromEntries(
		Object.entries(schema)
			.map(([table, columns]) => [table, Object.keys(columns).sort()] as const)
			.sort(([one], [other]) => one.localeCompare(other)),
	);

const foreignKeyIndexesOf = (
	schema: Record<string, Record<string, unknown>>,
) => {
	const sharedNullableId = schema.posBill?.tableId;

	return Object.entries(schema)
		.flatMap(([table, columns]) =>
			Object.entries(columns)
				.filter(
					([column, columnSchema]) =>
						column !== "id" &&
						(columnSchema === (TableIdSchema as unknown) ||
							columnSchema === sharedNullableId),
				)
				.map(([column]) => `${table}_${column}`),
		)
		.sort();
};

describe("AppSchema", () => {
	it("carries every table and column it was built with", () => {
		expect(shapeOf(AppSchema)).toMatchSnapshot();
	});

	it("still marks the same columns as foreign keys to index", () => {
		expect(
			foreignKeyIndexesOf(
				AppSchema as unknown as Record<string, Record<string, unknown>>,
			),
		).toMatchSnapshot();
	});
});
