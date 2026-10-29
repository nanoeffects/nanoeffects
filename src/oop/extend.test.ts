import { describe, expect, it, vi } from "vitest";
import { emitterPlugin } from "../actions";
import { createBus } from "../core/bus";
import { matchPlugin } from "../match";
import { disposeBus, extendBus } from ".";

type Events = { ping: number; pong: string };

const makeBus = () => createBus<Events>();

describe("extendBus", () => {
	it("returns a subclass of the base, with its name and constructor arguments", () => {
		const received: unknown[] = [];
		class Base {
			constructor(first: number, second: string) {
				received.push(first, second);
			}
		}
		const Service = extendBus(makeBus(), Base);
		const service = new Service(1, "two");

		expect(service).toBeInstanceOf(Base);
		expect(service).toBeInstanceOf(Service);
		expect(Service.name).toBe("Base");
		expect(received).toEqual([1, "two"]);
	});

	it("gives the instances on, once, off and emit that act on the bus", () => {
		const bus = makeBus();
		const Service = extendBus(bus, class {});
		const service = new Service();
		const handler = vi.fn();
		const onBus = vi.fn();
		bus.on("ping", onBus);
		service.on("ping", handler);
		service.emit("ping", 1);

		expect(handler).toHaveBeenCalledWith(
			1,
			expect.objectContaining({ type: "ping" }),
		);
		expect(onBus).toHaveBeenCalledTimes(1);
	});

	it("has the methods of the plugins used before extendBus, and not of those used later", () => {
		const bus = makeBus().use(emitterPlugin());
		const Service = extendBus(bus, class {});
		Reflect.set(bus, "later", () => "later");
		const service = new Service();

		expect(typeof Reflect.get(service, "emitter")).toBe("function");
		expect("later" in service).toBe(false);
	});

	it("does not give the slots of the bus", () => {
		const bus = makeBus();
		Reflect.set(bus, "app", {});
		const service = new (extendBus(bus, class {}))();

		for (const slot of [
			"ctx",
			"commands",
			"trace",
			"addContext",
			"use",
			"app",
		]) {
			expect(slot in service).toBe(false);
		}
	});

	it("lets the methods be destructured", () => {
		const bus = makeBus();
		const service = new (extendBus(bus, class {}))();
		const { emit, on } = service;
		const handler = vi.fn();
		on("ping", handler);
		emit("ping", 2);

		expect(handler).toHaveBeenCalledWith(2, expect.anything());
	});

	describe("the bus", () => {
		it("is made for the class when none is passed, and shared by its instances", () => {
			const Service = extendBus(class {});
			const first = new Service();
			const second = new Service();
			const handler = vi.fn();
			second.on("anything", handler);
			first.emit("anything", 1);

			expect(handler).toHaveBeenCalledTimes(1);
			expect(Service.bus).toBeDefined();
			expect(first.bus).toBe(Service.bus);
		});

		it("is the one that is passed, when no class is passed", () => {
			const bus = makeBus();
			class Service extends extendBus(bus) {}
			const first = new Service();
			const second = new Service();
			const onBus = vi.fn();
			const handler = vi.fn();
			bus.on("ping", onBus);
			second.on("ping", handler);
			first.emit("ping", 1);

			expect(Service.bus).toBe(bus);
			expect(first.bus).toBe(bus);
			expect(handler).toHaveBeenCalledTimes(1);
			expect(onBus).toHaveBeenCalledTimes(1);
		});

		it("has the methods of the plugins used before, when no class is passed", () => {
			const bus = makeBus().use(emitterPlugin());
			class Service extends extendBus(bus) {}

			expect(new Service().emitter).toBeTypeOf("function");
		});

		it("ends the subscriptions with dispose, when no class is passed", () => {
			const bus = makeBus();
			class Service extends extendBus(bus) {}
			const service = new Service();
			const handler = vi.fn();
			service.on("ping", handler);
			service.dispose();
			bus.emit("ping", 1);

			expect(handler).not.toHaveBeenCalled();
		});

		it("is one for each class", () => {
			const One = extendBus(class {});
			const Two = extendBus(class {});
			const handler = vi.fn();
			new Two().on("ping", handler);
			new One().emit("ping", 1);

			expect(handler).not.toHaveBeenCalled();
			expect(One.bus).not.toBe(Two.bus);
		});

		it("is the bus that was passed", () => {
			const bus = makeBus();
			const Service = extendBus(bus, class {});

			expect(Service.bus).toBe(bus);
			expect(new Service().bus).toBe(bus);
		});
	});

	describe("the subscriptions of an instance", () => {
		it("end with dispose, and only those", () => {
			const bus = makeBus();
			const Service = extendBus(bus, class {});
			const first = new Service();
			const second = new Service();
			const own = vi.fn();
			const fromFirst = vi.fn();
			const fromSecond = vi.fn();
			bus.on("ping", own);
			first.on("ping", fromFirst);
			first.once("pong", fromFirst);
			second.on("ping", fromSecond);
			first.dispose();
			bus.emit("ping", 1);
			bus.emit("pong", "x");

			expect(fromFirst).not.toHaveBeenCalled();
			expect(fromSecond).toHaveBeenCalledTimes(1);
			expect(own).toHaveBeenCalledTimes(1);
		});

		it("includes one made in the constructor of the base class", () => {
			const handler = vi.fn();
			const bus = makeBus();
			class Base {
				declare on: ReturnType<typeof makeBus>["on"];
				constructor() {
					this.on("ping", handler);
				}
			}
			const service = new (extendBus(bus, Base))();
			bus.emit("ping", 1);
			service.dispose();
			bus.emit("ping", 2);

			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("can be ended twice, and by Symbol.dispose", () => {
			const bus = makeBus();
			const service = new (extendBus(bus, class {}))();
			const handler = vi.fn();
			service.on("ping", handler);

			expect(() => {
				service.dispose();
				service.dispose();
			}).not.toThrow();
			service.on("ping", handler);
			service[Symbol.dispose]();
			bus.emit("ping", 1);

			expect(handler).not.toHaveBeenCalled();
		});

		it("end with the function on returned, and with off", () => {
			const bus = makeBus();
			const service = new (extendBus(bus, class {}))();
			const first = vi.fn();
			const second = vi.fn();
			const unsubscribe = service.on("ping", first);
			service.on("ping", second);
			unsubscribe();
			service.off("ping", second);
			bus.emit("ping", 1);

			expect(first).not.toHaveBeenCalled();
			expect(second).not.toHaveBeenCalled();
		});

		it("let a once run one time and a dispose after it do nothing", () => {
			const bus = makeBus();
			const service = new (extendBus(bus, class {}))();
			const handler = vi.fn();
			service.once("ping", handler);
			bus.emit("ping", 1);
			bus.emit("ping", 2);

			expect(handler).toHaveBeenCalledTimes(1);
			expect(() => service.dispose()).not.toThrow();
		});

		it("take a predicate when matchPlugin is used", () => {
			const bus = makeBus().use(matchPlugin());
			const service = new (extendBus(bus, class {}))();
			const handler = vi.fn();
			Reflect.apply(service.on, service, [() => true, handler]);
			bus.emit("ping", 1);
			service.dispose();
			bus.emit("ping", 2);

			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("do not count emit", () => {
			const bus = makeBus();
			const service = new (extendBus(bus, class {}))();
			const handler = vi.fn();
			bus.on("ping", handler);
			service.emit("ping", 1);
			service.dispose();
			service.emit("ping", 2);

			expect(handler).toHaveBeenCalledTimes(2);
		});

		it("keep the this they are given: an arrow does, a bare method does not", () => {
			const seen: unknown[] = [];
			class Base {
				name = "base";
				handle() {
					seen.push(Reflect.get(Object(this), "name"));
				}
			}
			const bus = makeBus();
			const service = new (extendBus(bus, Base))();
			service.on("ping", () => service.handle());
			service.on("pong", service.handle);
			bus.emit("ping", 1);
			bus.emit("pong", "x");

			// the bare method lost its this
			expect(seen).toEqual(["base", void 0]);
		});
	});

	describe("a clash of names", () => {
		it.each(["on", "once", "off", "emit", "dispose", "bus"])(
			"is won by the class: %s",
			(name) => {
				const own = () => "own";
				class Base {}
				Object.defineProperty(Base.prototype, name, { value: own });
				const service = new (extendBus(makeBus(), Base))();

				expect(Reflect.get(service, name)).toBe(own);
			},
		);

		it("keeps a method of a class that Base extends", () => {
			class Parent {
				emit() {
					return "parent";
				}
			}
			class Base extends Parent {}
			const service = new (extendBus(makeBus(), Base))();

			expect(service.emit()).toBe("parent");
		});

		it("lets a dispose of the class end the subscriptions with disposeBus", () => {
			const bus = makeBus();
			const cleaned = vi.fn();
			class Base {
				dispose() {
					cleaned();
					disposeBus(this);
				}
			}
			const service = new (extendBus(bus, Base))();
			const handler = vi.fn();
			service.on("ping", handler);
			service.dispose();
			bus.emit("ping", 1);

			expect(cleaned).toHaveBeenCalledTimes(1);
			expect(handler).not.toHaveBeenCalled();
		});

		it("makes disposeBus do nothing for another value", () => {
			expect(() => {
				disposeBus({});
				disposeBus(null);
				disposeBus("text");
				disposeBus(void 0);
			}).not.toThrow();
		});
	});

	it("can be extended again, and keeps the constructor of the subclass", () => {
		const bus = makeBus();
		const Service = extendBus(bus, class {});
		class Special extends Service {
			label = "special";
		}
		const special = new Special();
		const handler = vi.fn();
		special.on("ping", handler);
		bus.emit("ping", 1);
		special.dispose();
		bus.emit("ping", 2);

		expect(special).toBeInstanceOf(Special);
		expect(special.label).toBe("special");
		expect(handler).toHaveBeenCalledTimes(1);
	});
});
