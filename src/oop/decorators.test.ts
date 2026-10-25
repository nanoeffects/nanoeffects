import { describe, expect, it, vi } from "vitest";
import { createAction, createCommand } from "../actions";
import { createBus } from "../core/bus";
import { latest } from "../policies";
import { deferred } from "../tests/test-helpers";
import { extendBus, type MethodDecorator, On, Once, WithBus } from ".";

type Events = { ping: number; pong: string };

const makeBus = () => createBus<Events>();

// The test toolchain does not parse the `@` syntax, so a decorator is applied as the
// language does it: called with the function of the method. Both kinds of decorators
// take the same call, which the two helpers show.
const standard = <P>(
	decorator: MethodDecorator<P>,
	prototype: object,
	key: string,
) => {
	const method = Reflect.get(prototype, key);
	Reflect.apply(decorator, null, [method, { kind: "method", name: key }]);
};

const legacy = <P>(
	decorator: MethodDecorator<P>,
	prototype: object,
	key: string,
) => {
	const descriptor = Reflect.getOwnPropertyDescriptor(prototype, key);
	Reflect.apply(decorator, null, [prototype, key, descriptor]);
};

describe("@On and @Once", () => {
	it("make a method a handler of an instance, with this bound", () => {
		const bus = makeBus();
		const calls: unknown[] = [];
		class Base {
			name = "base";
			handle(payload: number, ctx: { type: string }) {
				calls.push([this.name, payload, ctx.type]);
			}
		}
		standard(On("ping"), Base.prototype, "handle");
		new (extendBus(bus, Base))();
		bus.emit("ping", 1);

		expect(calls).toEqual([["base", 1, "ping"]]);
	});

	it("work the same as the decorators of experimentalDecorators", () => {
		const bus = makeBus();
		const calls: unknown[] = [];
		class Base {
			name = "legacy";
			handle(payload: number) {
				calls.push([this.name, payload]);
			}
		}
		legacy(On("ping"), Base.prototype, "handle");
		new (extendBus(bus, Base))();
		bus.emit("ping", 1);

		expect(calls).toEqual([["legacy", 1]]);
	});

	it("subscribe once for each instance, on that instance", () => {
		const bus = makeBus();
		const seen: string[] = [];
		class Base {
			label: string;
			constructor(label: string) {
				this.label = label;
			}
			handle() {
				seen.push(this.label);
			}
		}
		standard(On("ping"), Base.prototype, "handle");
		const Service = extendBus(bus, Base);
		new Service("a");
		new Service("b");
		bus.emit("ping", 1);

		expect(seen).toEqual(["a", "b"]);
	});

	it("run @Once one time", () => {
		const bus = makeBus();
		const handler = vi.fn();
		class Base {
			handle(payload: number) {
				handler(payload);
			}
		}
		standard(Once("ping"), Base.prototype, "handle");
		new (extendBus(bus, Base))();
		bus.emit("ping", 1);
		bus.emit("ping", 2);

		expect(handler).toHaveBeenCalledTimes(1);
	});

	it("pass the bound handler through wrap, so a policy works", async () => {
		const bus = makeBus();
		const gate = deferred();
		const outcomes: string[] = [];
		class Base {
			async handle(payload: number, { signal }: { signal: AbortSignal }) {
				if (payload === 1) {
					await gate.promise;
				}
				outcomes.push(`${payload} ${signal.aborted ? "aborted" : "kept"}`);
			}
		}
		standard(On("ping", latest), Base.prototype, "handle");
		new (extendBus(bus, Base))();
		bus.emit("ping", 1);
		bus.emit("ping", 2);
		gate.resolve();
		await gate.promise;
		await Promise.resolve();

		expect(outcomes).toContain("2 kept");
		expect(outcomes).not.toContain("1 kept");
	});

	it("end with dispose", () => {
		const bus = makeBus();
		const handler = vi.fn();
		class Base {
			handle() {
				handler();
			}
		}
		standard(On("ping"), Base.prototype, "handle");
		const service = new (extendBus(bus, Base))();
		service.dispose();
		bus.emit("ping", 1);

		expect(handler).not.toHaveBeenCalled();
	});

	it("take an action creator and a command as the event", () => {
		const bus = createBus();
		const userLoaded = createAction<{ id: string }>("user/loaded");
		const double = createCommand<number, number>(
			"double",
			(value) => value * 2,
		);
		const seen: unknown[] = [];
		class Base {
			loaded(payload: { id: string }) {
				seen.push(payload.id);
			}
			doubled(payload: number) {
				seen.push(payload);
			}
		}
		standard(On(userLoaded), Base.prototype, "loaded");
		standard(On(double), Base.prototype, "doubled");
		new (extendBus(bus, Base))();
		bus.emit(userLoaded({ id: "u1" }));
		bus.emit(double(4));

		expect(seen).toEqual(["u1", 4]);
	});

	it("are inherited, and an override subscribes only when it is decorated", () => {
		const bus = makeBus();
		const seen: string[] = [];
		class Parent {
			handle() {
				seen.push("parent");
			}
		}
		standard(On("ping"), Parent.prototype, "handle");
		class Inheriting extends Parent {}
		class Overriding extends Parent {
			override handle() {
				seen.push("override");
			}
		}
		class Decorated extends Parent {
			override handle() {
				seen.push("decorated");
			}
		}
		standard(On("ping"), Decorated.prototype, "handle");
		new (extendBus(bus, Inheriting))();
		bus.emit("ping", 1);
		new (extendBus(bus, Overriding))();
		bus.emit("ping", 1);
		new (extendBus(bus, Decorated))();
		bus.emit("ping", 1);

		// the first instance hears every emit
		expect(seen).toEqual(["parent", "parent", "parent", "decorated"]);
	});

	it("do nothing on a class that extendBus did not make", () => {
		const bus = makeBus();
		const handler = vi.fn();
		class Plain {
			handle() {
				handler();
			}
		}
		standard(On("ping"), Plain.prototype, "handle");
		new Plain();
		bus.emit("ping", 1);

		expect(handler).not.toHaveBeenCalled();
	});
});

describe("WithBus", () => {
	it("does what extendBus does, with a bus", () => {
		const bus = makeBus();
		const received: unknown[] = [];
		class Base {
			value: number;
			constructor(value: number) {
				this.value = value;
				received.push(value);
			}
		}
		const Service = WithBus(bus)(Base);
		const service = new Service(3);
		const handler = vi.fn();
		service.on("ping", handler);
		service.emit("ping", 1);
		service.dispose();
		service.emit("ping", 2);

		expect(received).toEqual([3]);
		expect(handler).toHaveBeenCalledTimes(1);
		expect(Service.bus).toBe(bus);
	});

	it("makes a bus for the class when none is given", () => {
		const Service = WithBus()(class {});

		expect(new Service().bus).toBe(Service.bus);
	});
});
