import v8 from "node:v8";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import {
	createAction,
	createCommand,
	createJob,
	createModule,
	modulePlugin,
} from "../actions";
import { createBus, type WithContext } from "../core/bus";
import type { EventMap } from "../core/types";
import { delay } from "../effects";
import { noPayload } from "../tests/test-helpers";
import { effect, scopePlugin } from ".";

// Node hands out `gc` to a script when asked for it at run time, so no flag is needed to run the tests
v8.setFlagsFromString("--expose-gc");
const collect = vm.runInNewContext("gc") as () => void;

// the fields the calls below replace, declared so the checker has a type to hold them to
type Fields = EventMap & WithContext<{ label?: object; big?: object }>;

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

// garbage is not collected at the first try: let the engine settle
const settle = async () => {
	for (let round = 0; round < 5; round++) {
		await tick();
		collect();
	}
};

const alive = (refs: ReadonlyArray<WeakRef<object>>) =>
	refs.filter((ref) => ref.deref() !== void 0).length;

describe("scopes do not leak", () => {
	it("the check sees a context that is kept", async () => {
		const bus = createBus().use(scopePlugin());
		const kept: object[] = [];
		const hold = createCommand(
			"hold",
			(_: undefined, ctx) => {
				kept.push(ctx);
			},
			{ name: "held" },
		);
		bus.emit(hold(noPayload));
		const refs = kept.map((ctx) => new WeakRef(ctx));
		await settle();

		expect(alive(refs)).toBe(1);
	});

	it("task contexts are collectable after many tasks with every kind of field", async () => {
		const bus = createBus<Fields>().use(scopePlugin());
		const refs: Array<WeakRef<object>> = [];
		const first = effect(
			<T>(_ctx: { signal: AbortSignal }, items: T[]): T | undefined => items[0],
		);
		const wait = (ctx: { signal: AbortSignal }, ms: number) => delay(ctx, ms);
		const work = createCommand(
			"work",
			async (id: number, ctx) => {
				refs.push(new WeakRef(ctx));
				await ctx.wait(0);
				return ctx.first([id]);
			},
			{
				first,
				label: { big: new Array(10).fill(0) },
				effects: { wait },
			},
		);

		const run = async () => {
			const pending: unknown[] = [];
			for (let id = 0; id < 200; id++) {
				pending.push(bus.emit(work(id), { label: { id } }));
			}
			await Promise.all(pending);
		};
		await run();
		await settle();

		expect(refs).toHaveLength(200);
		expect(alive(refs)).toBe(0);
	});

	it("the scope given to one emit is not kept after it", async () => {
		const bus = createBus<Fields>().use(scopePlugin());
		const loaded = createAction("user/loaded");
		bus.on(loaded, () => {});
		const refs: Array<WeakRef<object>> = [];

		const emitWithBigScope = () => {
			const big = { payload: new Array(1000).fill("x") };
			refs.push(new WeakRef(big));
			bus.emit(loaded("a"), { big });
		};
		emitWithBigScope();
		await settle();

		expect(alive(refs)).toBe(0);
	});

	it("a scope on a command is held by the command only", async () => {
		const refs: Array<WeakRef<object>> = [];
		const make = () => {
			const bus = createBus().use(scopePlugin());
			const fields = { name: "fields" };
			refs.push(new WeakRef(fields));
			const read = createCommand("read", (_: undefined) => 1, {
				fields,
			});
			bus.emit(read(noPayload));
		};
		make();
		await settle();

		expect(alive(refs)).toBe(0);
	});

	it("a job's scope is not kept by the outcome it sends", async () => {
		const bus = createBus().use(scopePlugin());
		const refs: Array<WeakRef<object>> = [];
		const make = async () => {
			const fields = { name: "job" };
			refs.push(new WeakRef(fields));
			const load = createJob(
				"user/load",
				async (id: string) => id,
				{},
				{
					fields,
				},
			);
			await bus.emit(load("1"));
		};
		await make();
		await settle();

		expect(alive(refs)).toBe(0);
	});

	it("unmounting a module releases its scope and its contexts", async () => {
		const bus = createBus().use(scopePlugin());
		const app = bus.use(modulePlugin());
		const refs: Array<WeakRef<object>> = [];
		const mountOnce = () => {
			const fields = { name: "module" };
			refs.push(new WeakRef(fields));
			const userModule = createModule(
				"user",
				(moduleContext) => {
					moduleContext.on("ping", (_, ctx) => {
						refs.push(new WeakRef(ctx));
					});
				},
				{ fields },
			);
			app.mount(userModule);
			bus.emit("ping");
			app.unmount(userModule);
		};
		mountOnce();
		await settle();

		expect(refs).toHaveLength(2);
		expect(alive(refs)).toBe(0);
	});

	it("a task that is aborted while a bound effect waits is collectable", async () => {
		const bus = createBus().use(scopePlugin());
		const refs: Array<WeakRef<object>> = [];
		const hang = (ctx: { signal: AbortSignal }) =>
			new Promise<void>((resolve) => {
				ctx.signal.addEventListener("abort", () => resolve());
			});
		const stuck = createCommand(
			"stuck",
			async (_: undefined, ctx) => {
				refs.push(new WeakRef(ctx));
				const waiting = ctx.hang();
				ctx.abort();
				await waiting;
			},
			{ effects: { hang } },
		);
		for (let round = 0; round < 50; round++) {
			await bus.emit(stuck(noPayload));
		}
		await settle();

		expect(refs).toHaveLength(50);
		expect(alive(refs)).toBe(0);
	});
});
