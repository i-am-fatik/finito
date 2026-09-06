import { z } from "zod";

export type DiagnosticLevel = "error" | "warning";

export type DiagnosticSource =
	| "console"
	| "window"
	| "resource"
	| "promise"
	| "evolu";

export type DiagnosticEvent = {
	id: number;
	at: number;
	level: DiagnosticLevel;
	source: DiagnosticSource;
	message: string;
	page: string;
	count: number;
};

export type DiagnosticSink = (event: DiagnosticEvent) => void;

type DiagnosticStorage = Pick<Storage, "getItem" | "setItem">;

type ErrorStore = {
	subscribe: (listener: () => void) => () => void;
	get: () => unknown;
};

type CollectorTarget = Pick<Window, "addEventListener" | "removeEventListener">;

export const diagnosticsCapacity = 200;
const messageLimit = 4000;
const storageKey = "finito.diagnostics";

const storedEventSchema = z.object({
	id: z.number(),
	at: z.number(),
	level: z.enum(["error", "warning"]),
	source: z.enum(["console", "window", "resource", "promise", "evolu"]),
	message: z.string(),
	page: z.string(),
	count: z.number(),
});

const store = {
	events: [] as ReadonlyArray<DiagnosticEvent>,
	nextId: 1,
	listeners: new Set<() => void>(),
	sinks: new Set<DiagnosticSink>(),
	storage: null as DiagnosticStorage | null,
	pageOf: () => "",
	now: (() => Date.now()) as () => number,
	recording: false,
};

const describeError = (error: Error): string => {
	const head = `${error.name}: ${error.message}`;
	const stack = error.stack ?? "";
	const described = stack.startsWith(head) ? stack : `${head}\n${stack}`;
	const cause =
		error.cause === undefined
			? ""
			: `\ncaused by: ${describeDiagnosticValue(error.cause)}`;

	return `${described.trim()}${cause}`;
};

const errorAsJson = (_key: string, value: unknown) =>
	value instanceof Error
		? { name: value.name, message: value.message, stack: value.stack }
		: value;

export const describeDiagnosticValue = (value: unknown): string => {
	if (value instanceof Error) {
		return describeError(value);
	}
	if (typeof value === "string") {
		return value;
	}
	try {
		return JSON.stringify(value, errorAsJson, 2) ?? String(value);
	} catch {
		return String(value);
	}
};

const clip = (message: string) =>
	message.length > messageLimit
		? `${message.slice(0, messageLimit)}…`
		: message;

const persist = () => {
	try {
		store.storage?.setItem(storageKey, JSON.stringify(store.events));
	} catch {}
};

const hydrate = () => {
	try {
		const raw = store.storage?.getItem(storageKey);
		if (raw === null || raw === undefined) {
			return;
		}
		const parsed = z.array(storedEventSchema).safeParse(JSON.parse(raw));
		if (!parsed.success) {
			return;
		}
		store.events = parsed.data.slice(0, diagnosticsCapacity);
		store.nextId = Math.max(0, ...store.events.map((event) => event.id)) + 1;
		notify();
	} catch {}
};

const notify = () => {
	for (const listener of store.listeners) {
		listener();
	}
};

export const recordDiagnostic = (input: {
	level: DiagnosticLevel;
	source: DiagnosticSource;
	message: string;
}): void => {
	if (store.recording) {
		return;
	}
	store.recording = true;
	try {
		const message = clip(input.message);
		const at = store.now();
		const [latest, ...older] = store.events;
		const repeats =
			latest !== undefined &&
			latest.level === input.level &&
			latest.source === input.source &&
			latest.message === message;
		const event: DiagnosticEvent = repeats
			? { ...latest, at, count: latest.count + 1 }
			: {
					id: store.nextId++,
					at,
					level: input.level,
					source: input.source,
					message,
					page: store.pageOf(),
					count: 1,
				};
		store.events = [event, ...(repeats ? older : store.events)].slice(
			0,
			diagnosticsCapacity,
		);
		persist();
		notify();
		for (const sink of store.sinks) {
			try {
				sink(event);
			} catch {}
		}
	} finally {
		store.recording = false;
	}
};

export const readDiagnostics = (): ReadonlyArray<DiagnosticEvent> =>
	store.events;

export const subscribeDiagnostics = (listener: () => void) => {
	store.listeners.add(listener);

	return () => {
		store.listeners.delete(listener);
	};
};

export const clearDiagnostics = () => {
	store.events = [];
	persist();
	notify();
};

export const formatDiagnostics = (events: ReadonlyArray<DiagnosticEvent>) =>
	events
		.map(
			(event) =>
				`${new Date(event.at).toISOString()} ${event.level} ${event.source} ${event.page}${event.count > 1 ? ` ×${event.count}` : ""}\n${event.message}`,
		)
		.join("\n\n");

export const watchEvoluErrors = (errors: ErrorStore) =>
	errors.subscribe(() => {
		const error = errors.get();
		if (error === null || error === undefined) {
			return;
		}
		recordDiagnostic({
			level: "error",
			source: "evolu",
			message: describeDiagnosticValue(error),
		});
	});

const relayedByEvolu = (args: ReadonlyArray<unknown>) =>
	args.length === 2 &&
	(args[0] === "error" || args[0] === "unhandledrejection") &&
	typeof args[1] === "object" &&
	args[1] !== null &&
	(args[1] as { type?: unknown }).type === "UnknownError";

const resourceUrl = (target: EventTarget | null) => {
	if (
		target instanceof HTMLScriptElement ||
		target instanceof HTMLImageElement
	) {
		return target.src;
	}
	if (target instanceof HTMLLinkElement) {
		return target.href;
	}
	return null;
};

export const installDiagnosticsCollector = (options: {
	target: CollectorTarget;
	console: Pick<Console, "error" | "warn">;
	storage?: DiagnosticStorage | null;
	sink?: DiagnosticSink;
	page?: () => string;
	now?: () => number;
}) => {
	store.storage = options.storage ?? null;
	store.pageOf = options.page ?? (() => "");
	store.now = options.now ?? (() => Date.now());
	if (options.sink !== undefined) {
		store.sinks.add(options.sink);
	}
	hydrate();

	const patched = options.console;
	const originalError = patched.error;
	const originalWarn = patched.warn;
	const capture = (level: DiagnosticLevel, args: ReadonlyArray<unknown>) => {
		if (relayedByEvolu(args)) {
			return;
		}
		recordDiagnostic({
			level,
			source: "console",
			message: args.map(describeDiagnosticValue).join(" "),
		});
	};
	patched.error = (...args: unknown[]) => {
		originalError.apply(patched, args);
		capture("error", args);
	};
	patched.warn = (...args: unknown[]) => {
		originalWarn.apply(patched, args);
		capture("warning", args);
	};

	const onError = (event: Event) => {
		if (event instanceof ErrorEvent) {
			const detail =
				event.error instanceof Error
					? describeError(event.error)
					: event.message;
			const place = event.filename
				? ` @ ${event.filename}:${event.lineno}:${event.colno}`
				: "";
			recordDiagnostic({
				level: "error",
				source: "window",
				message: `${detail}${place}`,
			});
			return;
		}
		const url = resourceUrl(event.target);
		if (url !== null) {
			recordDiagnostic({
				level: "error",
				source: "resource",
				message: `Failed to load ${url}`,
			});
		}
	};
	const onRejection = (event: Event) => {
		recordDiagnostic({
			level: "error",
			source: "promise",
			message: describeDiagnosticValue((event as { reason?: unknown }).reason),
		});
	};
	options.target.addEventListener("error", onError, true);
	options.target.addEventListener("unhandledrejection", onRejection);

	return () => {
		options.target.removeEventListener("error", onError, true);
		options.target.removeEventListener("unhandledrejection", onRejection);
		patched.error = originalError;
		patched.warn = originalWarn;
		if (options.sink !== undefined) {
			store.sinks.delete(options.sink);
		}
		store.storage = null;
	};
};
