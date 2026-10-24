import { describe, expect, it } from "vitest";
import { createCommand, createModule, modulePlugin } from "../actions";
import { createBus } from "../core/bus";
import { scopePlugin } from "../scope";
import { noPayload } from "./test-helpers";

type Fields = Record<string, string>;
const keys = ["x", "y", "z"] as const;

// a small deterministic generator, so a failing case can be replayed
const generator = (seed: number) => {
	let state = seed;

	return () => {
		state = (state * 1664525 + 1013904223) % 4294967296;
		return state / 4294967296;
	};
};

// some of the three fields, each with the name of the layer as its value
const fieldsOf = (random: () => number, layer: string): Fields | undefined => {
	if (random() < 0.3) {
		return;
	}
	const picked: Fields = {};
	for (const key of keys) {
		if (random() < 0.5) {
			picked[key] = layer;
		}
	}

	return picked;
};

const observe = (ctx: object) =>
	Object.fromEntries(keys.map((key) => [key, Reflect.get(ctx, key)]));

describe("scope layers against a model", () => {
	// the model: for each field, the strongest layer that has it
	const expected = (layers: Array<Fields | undefined>) => {
		const result: Record<string, unknown> = {};
		for (const key of keys) {
			result[key] = layers.find((layer) => layer?.[key] !== void 0)?.[key];
		}

		return result;
	};

	it("emit beats command beats module beats bus, in any combination", () => {
		for (let seed = 1; seed <= 300; seed++) {
			const random = generator(seed);
			const bus = fieldsOf(random, "bus");
			const module = fieldsOf(random, "module");
			const command = fieldsOf(random, "command");
			const call = fieldsOf(random, "emit");
			const seen: unknown[] = [];

			const read = createCommand(
				"read",
				(_payload, ctx) => {
					seen.push(observe(ctx));
				},
				{ ...command },
			);
			const app = createBus(bus ? { context: bus } : {}).use(scopePlugin());
			app.use(
				modulePlugin([
					createModule(
						"owner",
						(moduleContext) => {
							moduleContext.handle(read, (_, ctx) => {
								seen.push(observe(ctx));
							});
						},
						{ ...module },
					),
				]),
			);

			// the checker holds an override to the fields a bus declares, and this bus declares none
			Reflect.apply(app.emit, app, [read(noPayload), { ...call }]);

			// the scope of a command is on the call, and the module wraps the handler it bound
			expect({ seed, seen: seen[0] }).toEqual({
				seed,
				seen: expected([call, command, module, bus]),
			});
		}
	});
});
