export type JsonValue =
	| null
	| boolean
	| number
	| string
	| JsonValue[]
	| { [key: string]: JsonValue };

export type SerializeOptions = {
	/** How deep to go before a value becomes a marker like `"[Object]"`. Default 6. */
	maxDepth?: number;
	/** How many values, in all, to visit before the rest is cut. Default 1000. */
	maxSize?: number;
};

const maxText = 2000;

type Run = {
	maxDepth: number;
	// values left to visit: the budget is for the whole result, not for one branch
	budget: number;
	// the objects above the one being read, to name a cycle
	path: Set<object>;
};

const cut = "[Cut]";

const nameOf = (value: object) => {
	const proto = Object.getPrototypeOf(value);
	const maker: unknown =
		proto === null ? void 0 : Reflect.get(proto, "constructor");
	const name: unknown = typeof maker === "function" ? maker.name : "";

	return typeof name === "string" && name !== "" ? name : "Object";
};

const isPlain = (value: object) => {
	const proto = Object.getPrototypeOf(value);

	return proto === null || proto === Object.prototype;
};

// a DOM node, without relying on a global `Node` (a server has none)
const isDomNode = (value: object) =>
	typeof Reflect.get(value, "nodeType") === "number" &&
	typeof Reflect.get(value, "nodeName") === "string";

const textOf = (value: string) =>
	value.length > maxText ? `${value.slice(0, maxText)}…` : value;

const primitive = (value: unknown): JsonValue | undefined => {
	switch (typeof value) {
		case "string":
			return textOf(value);
		case "boolean":
			return value;
		case "number":
			return Number.isFinite(value) ? value : String(value);
		case "bigint":
			return `${value}n`;
		case "symbol":
			return String(value);
		case "function":
			return `[Function ${value.name || "anonymous"}]`;
		default:
			return value === null ? null : void 0;
	}
};

// the objects that have no readable content of their own
const opaque = (value: object): string | undefined => {
	if (value instanceof WeakMap) {
		return "[WeakMap]";
	}
	if (value instanceof WeakSet) {
		return "[WeakSet]";
	}
	if (value instanceof Promise) {
		return "[Promise]";
	}
	if (isDomNode(value)) {
		return `[DOM ${String(Reflect.get(value, "nodeName"))}]`;
	}
	if (value instanceof Date) {
		return Number.isNaN(value.getTime())
			? "[Invalid Date]"
			: value.toISOString();
	}

	return void 0;
};

const read = (value: unknown, run: Run, depth: number): JsonValue => {
	if (run.budget <= 0) {
		return cut;
	}
	run.budget -= 1;

	const simple = primitive(value);
	if (simple !== void 0) {
		return simple;
	}
	if (typeof value !== "object" || value === null) {
		return "[undefined]";
	}

	return readObject(value, run, depth);
};

const readObject = (value: object, run: Run, depth: number): JsonValue => {
	// a Proxy, or an object whose own methods throw: only this value is lost
	try {
		const hidden = opaque(value);
		if (hidden !== void 0) {
			return hidden;
		}
		if (run.path.has(value)) {
			return "[Circular]";
		}
		if (depth >= run.maxDepth) {
			return Array.isArray(value) ? "[Array]" : `[${nameOf(value)}]`;
		}

		return inside(value, run, depth);
	} catch {
		return "[Unserializable]";
	}
};

const inside = (value: object, run: Run, depth: number): JsonValue => {
	run.path.add(value);
	try {
		return readContent(value, run, depth);
	} finally {
		run.path.delete(value);
	}
};

const readContent = (value: object, run: Run, depth: number): JsonValue => {
	if (value instanceof Error) {
		return readError(value, run, depth);
	}
	if (Array.isArray(value)) {
		return readList(value, run, depth);
	}
	if (value instanceof Map) {
		return { $map: readList([...value.entries()], run, depth) };
	}
	if (value instanceof Set) {
		return { $set: readList([...value.values()], run, depth) };
	}
	if (ArrayBuffer.isView(value)) {
		return {
			$class: nameOf(value),
			length: Number(Reflect.get(value, "length")),
		};
	}

	return readFields(value, run, depth, isPlain(value) ? void 0 : nameOf(value));
};

const readError = (error: Error, run: Run, depth: number): JsonValue => {
	const result: { [key: string]: JsonValue } = {
		name: textOf(error.name),
		message: textOf(error.message),
	};
	if (typeof error.stack === "string") {
		result.stack = textOf(error.stack);
	}
	if ("cause" in error) {
		result.cause = read(error.cause, run, depth + 1);
	}

	return result;
};

const readList = (
	list: readonly unknown[],
	run: Run,
	depth: number,
): JsonValue[] => {
	const items: JsonValue[] = [];
	for (const [index, item] of list.entries()) {
		if (run.budget <= 0) {
			items.push(`[${list.length - index} more]`);
			break;
		}
		items.push(read(item, run, depth + 1));
	}

	return items;
};

// the own enumerable fields; a getter is named, never called
const readFields = (
	value: object,
	run: Run,
	depth: number,
	className: string | undefined,
): JsonValue => {
	const result: { [key: string]: JsonValue } = {};
	if (className !== void 0) {
		result.$class = className;
	}
	for (const key of Object.keys(value)) {
		const descriptor = Object.getOwnPropertyDescriptor(value, key);
		if (!descriptor) {
			continue;
		}
		result[key] =
			"value" in descriptor
				? read(descriptor.value, run, depth + 1)
				: "[Getter]";
	}

	return result;
};

/**
 * Makes any value a plain JSON value: never throws, never loops, never calls
 * a getter or `toJSON`, and cuts a value that is too deep or too big.
 * `Error` keeps its name, message, stack and cause; a cycle is `"[Circular]"`;
 * `Map` and `Set` become `{ $map }` and `{ $set }`; an instance of a class
 * keeps its own fields and its name as `$class`.
 *
 * @example
 * ```ts
 * safeSerialize({ user: new User("Ann"), tags: new Set(["a"]) });
 * // { user: { $class: "User", name: "Ann" }, tags: { $set: ["a"] } }
 * ```
 */
export const safeSerialize = (
	value: unknown,
	options: SerializeOptions = {},
): JsonValue => {
	const run: Run = {
		maxDepth: options.maxDepth ?? 6,
		budget: options.maxSize ?? 1000,
		path: new Set(),
	};
	try {
		return read(value, run, 0);
	} catch {
		// a Proxy or an object whose own methods throw
		return "[Unserializable]";
	}
};
