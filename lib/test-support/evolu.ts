import type { Evolu } from "@/lib/evolu";

export type EvoluWrite = {
	table: string;
	values: Record<string, unknown>;
};

export type EvoluRow = Record<string, unknown>;

export const writesTo = (writes: ReadonlyArray<EvoluWrite>, table: string) =>
	writes.filter((write) => write.table === table);

export const setupEvolu = (params?: {
	rowsFor?: (query: string) => ReadonlyArray<EvoluRow>;
}) => {
	const upserts: EvoluWrite[] = [];
	const updates: EvoluWrite[] = [];
	const inserts: EvoluWrite[] = [];
	const queryListeners = new Set<() => void>();
	const rowsFor = params?.rowsFor ?? (() => []);

	const recordInto =
		(writes: EvoluWrite[]) => (table: string, values: EvoluRow) => {
			writes.push({ table, values });
			return { id: values.id };
		};

	const evolu = {
		loadQuery: (query: string) => Promise.resolve(rowsFor(query)),
		getQueryRows: (query: string) => rowsFor(query),
		subscribeQuery: () => (listener: () => void) => {
			queryListeners.add(listener);
			return () => {
				queryListeners.delete(listener);
			};
		},
		upsert: recordInto(upserts),
		update: recordInto(updates),
		insert: recordInto(inserts),
	};

	return {
		evolu: evolu as unknown as Evolu,
		upserts,
		updates,
		inserts,
		notifyQueryListeners: () => {
			for (const listener of queryListeners) {
				listener();
			}
		},
	};
};
