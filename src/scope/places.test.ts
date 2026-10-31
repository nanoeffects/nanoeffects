import { describe, expect, it } from "vitest";
import {
	createAction,
	createJob,
	createModule,
	modulePlugin,
	setHandler,
} from "../actions";
import type { Call } from "../core/action-creator";
import { createBus } from "../core/bus";
import { noPayload } from "../tests/test-helpers";
import { scopePlugin } from ".";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

type Fields = { readonly name: string };
const base: Fields = { name: "bus" };
const moduleFields: Fields = { name: "module" };
const commandFields: Fields = { name: "command" };
const callFields: Fields = { name: "call" };

const nameOf = (ctx: object) =>
	(Reflect.get(ctx, "fields") as Fields | undefined)?.name;

describe("job scope", () => {
	it("gives its fields to the handler and to the listeners of success and fail", async () => {
		const bus = createBus().use(scopePlugin());
		const seen: unknown[] = [];
		const load = createJob(
			"user/load",
			async (id: string, ctx) => {
				seen.push(["handler", nameOf(ctx)]);
				if (id === "bad") {
					throw new Error("bad");
				}
				return id;
			},
			{},
			{ fields: commandFields },
		);
		bus.on(load.success, (_user, ctx) => {
			seen.push(["success", nameOf(ctx)]);
		});
		bus.on(load.fail, (_error, ctx) => {
			seen.push(["fail", nameOf(ctx)]);
		});

		await bus.emit(load("1"));
		await bus.emit(load("bad"));

		expect(seen).toEqual([
			["handler", "command"],
			["success", "command"],
			["handler", "command"],
			["fail", "command"],
		]);
	});

	it("gives its fields to the listeners of pending and cancel", async () => {
		const bus = createBus().use(scopePlugin());
		const seen: unknown[] = [];
		const load = createJob(
			"user/load",
			async (_id: string, ctx) => {
				ctx.abort();
				return "x";
			},
			{},
			{ fields: commandFields },
		);
		bus.on(load.pending, (_id, ctx) => {
			seen.push(["pending", nameOf(ctx)]);
		});
		bus.on(load.cancel, (_reason, ctx) => {
			seen.push(["cancel", nameOf(ctx)]);
		});

		await bus.emit(load("1"));

		expect(seen).toEqual([
			["pending", "command"],
			["cancel", "command"],
		]);
	});

	it("the outcome action's own scope wins over the job's, field by field", async () => {
		const bus = createBus().use(scopePlugin());
		const seen: unknown[] = [];
		const jobFields = { name: "job" };
		const actionFields = { name: "action" };
		const done = createAction("user/done", { fields: actionFields });
		const load = createJob(
			"user/load",
			async (id: string, ctx) => {
				seen.push(["handler", nameOf(ctx), Reflect.get(ctx, "trace")]);
				return id;
			},
			{ success: done },
			{ fields: jobFields, trace: "job" },
		);
		bus.on(done, (_user, ctx) => {
			seen.push(["success", nameOf(ctx), Reflect.get(ctx, "trace")]);
		});

		await bus.emit(load("1"));

		expect(seen).toEqual([
			["handler", "job", "job"],
			["success", "action", "job"],
		]);
	});

	it("an outcome action without a scope sees the job's", async () => {
		const bus = createBus().use(scopePlugin());
		const seen: unknown[] = [];
		const load = createJob(
			"user/load",
			async (id: string) => id,
			{},
			{ fields: commandFields },
		);
		bus.on(load.success, (_user, ctx) => {
			seen.push(nameOf(ctx));
		});

		await bus.emit(load("1"));

		expect(seen).toEqual(["command"]);
	});

	it("a job without a scope adds nothing", async () => {
		const bus = createBus().use(scopePlugin());
		const seen: unknown[] = [];
		const load = createJob("user/load", async (id: string, ctx) => {
			seen.push(nameOf(ctx));
			return id;
		});

		await bus.emit(load("1"));

		expect(seen).toEqual([void 0]);
	});

	it("is ignored on a bus without the plugin", async () => {
		const bus = createBus();
		const seen: unknown[] = [];
		const load = createJob(
			"user/load",
			async (id: string, ctx) => {
				seen.push(nameOf(ctx));
				return id;
			},
			{},
			{ fields: commandFields },
		);

		await bus.emit(load("1"));

		expect(seen).toEqual([void 0]);
	});
});

describe("module scope", () => {
	const mounted = (modules: Parameters<typeof modulePlugin>[0]) => {
		const bus = createBus().use(scopePlugin());
		const app = bus.use(modulePlugin(modules));

		return { bus, app };
	};

	it("covers moduleContext.on, moduleContext.handle, moduleContext.use and moduleContext.spawn", async () => {
		const seen: unknown[] = [];
		const ask = createAction("ask", (_: undefined, ctx) => {
			seen.push(["handle", nameOf(ctx)]);
		});
		const own = createAction("own", (_: undefined, ctx) => {
			seen.push(["use", nameOf(ctx)]);
		});
		const bound = createAction<Call<void, void>>("bound");
		const userModule = createModule(
			"user",
			(moduleContext) => {
				seen.push(["setup", nameOf(moduleContext)]);
				moduleContext.on("ping", (_, ctx) => {
					seen.push(["on", nameOf(ctx)]);
				});
				moduleContext.handle(ask, (_, ctx) => {
					seen.push(["handle", nameOf(ctx)]);
				});
				moduleContext.handle([
					setHandler(bound, (_, ctx) => {
						seen.push(["bindings", nameOf(ctx)]);
					}),
				]);
				moduleContext.use(own);
				moduleContext.spawn(async (_, ctx) => {
					await Promise.resolve();
					seen.push(["spawn", nameOf(ctx)]);
				});
			},
			{ fields: moduleFields },
		);
		const { bus } = mounted([userModule]);

		bus.emit("ping");
		bus.emit(ask(noPayload));
		bus.emit(bound());
		bus.emit(own(noPayload));
		await flush();

		expect(seen).toEqual([
			["setup", "module"],
			["on", "module"],
			["handle", "module"],
			["bindings", "module"],
			["use", "module"],
			["spawn", "module"],
		]);
	});

	it("is not seen by a listener outside the module or by another module", () => {
		const seen: unknown[] = [];
		const first = createModule(
			"first",
			(moduleContext) => {
				moduleContext.on("ping", (_, ctx) => {
					seen.push(["first", nameOf(ctx)]);
				});
			},
			{ fields: moduleFields },
		);
		const second = createModule("second", (moduleContext) => {
			moduleContext.on("ping", (_, ctx) => {
				seen.push(["second", nameOf(ctx)]);
			});
		});
		const { bus } = mounted([first, second]);
		bus.on("ping", (_, ctx) => {
			seen.push(["outside", nameOf(ctx)]);
		});

		bus.emit("ping");

		expect(seen).toEqual([
			["first", "module"],
			["second", void 0],
			["outside", void 0],
		]);
	});

	it("the bus, then the module, then the command, then emit", () => {
		const seen: unknown[] = [];
		const read = createAction(
			"read",
			(_: undefined, ctx) => {
				seen.push(nameOf(ctx));
			},
			{ fields: commandFields },
		);
		const plain = createAction("plain", (_: undefined, ctx) => {
			seen.push(nameOf(ctx));
		});
		const userModule = createModule(
			"user",
			(moduleContext) => {
				moduleContext.handle(read, (_, ctx) => {
					seen.push(nameOf(ctx));
				});
				moduleContext.use(plain);
			},
			{ fields: moduleFields },
		);
		const bus = createBus({ context: { fields: base } }).use(scopePlugin());
		bus.use(modulePlugin([userModule]));

		bus.emit(plain(noPayload));
		bus.emit(read(noPayload));
		bus.emit(read(noPayload), { fields: callFields });

		expect(seen).toEqual(["module", "command", "call"]);
	});

	it("unmounting stops the module's handlers, and a new version of the module has its own scope", () => {
		const seen: unknown[] = [];
		const make = (fields: Fields) =>
			createModule(
				"user",
				(moduleContext) => {
					moduleContext.on("ping", (_, ctx) => {
						seen.push(nameOf(ctx));
					});
				},
				{ fields },
			);
		const { bus, app } = mounted([make(moduleFields)]);

		bus.emit("ping");
		app.mount(make({ name: "next" }));
		bus.emit("ping");
		app.dispose();
		bus.emit("ping");

		expect(seen).toEqual(["module", "next"]);
	});

	it("a child of a spawned task has the fields too", async () => {
		const seen: unknown[] = [];
		const userModule = createModule(
			"user",
			(moduleContext) => {
				moduleContext.spawn(async (_, ctx) => {
					await ctx.run((_payload: undefined, child) => {
						seen.push(nameOf(child));
					});
				});
			},
			{ fields: moduleFields },
		);
		const { app } = mounted([userModule]);
		app.isMounted(userModule);
		await flush();

		expect(seen).toEqual(["module"]);
	});

	it("is ignored on a bus without the plugin", () => {
		const seen: unknown[] = [];
		const userModule = createModule(
			"user",
			(moduleContext) => {
				moduleContext.on("ping", (_, ctx) => {
					seen.push(nameOf(ctx));
				});
			},
			{ fields: moduleFields },
		);
		const bus = createBus();
		bus.use(modulePlugin([userModule]));

		bus.emit("ping");

		expect(seen).toEqual([void 0]);
	});
});

describe("action scope", () => {
	it("is ignored on a bus without the plugin", () => {
		const bus = createBus();
		const seen: unknown[] = [];
		const loaded = createAction("user/loaded", {
			fields: commandFields,
		});
		bus.on(loaded, (_user, ctx) => {
			seen.push(nameOf(ctx));
		});

		bus.emit(loaded("a"));

		expect(seen).toEqual([void 0]);
	});
});
