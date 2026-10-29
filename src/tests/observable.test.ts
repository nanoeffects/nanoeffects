import { describe, expect, it, vi } from "vitest";
import { createBus } from "../core/bus";
import { $$observable, createObserve, Subject } from "../observable";
import { type BusMethods, extendBus, WithBus } from "../oop";

type Events = { a: number; b: string };

describe("observable", () => {
	it("delivers events to a function observer", () => {
		const bus = createBus<Events>();
		const seen: number[] = [];
		createObserve(bus)("a").subscribe((v) => seen.push(v));
		bus.emit("a", 1);
		bus.emit("a", 2);

		expect(seen).toEqual([1, 2]);
	});

	it("delivers events to an observer object", () => {
		const bus = createBus<Events>();
		const next = vi.fn();
		createObserve(bus)("a").subscribe({ next });
		bus.emit("a", 1);

		expect(next.mock.calls[0]?.[0]).toBe(1);
	});

	it("accepts an observer object without next", () => {
		const bus = createBus<Events>();
		createObserve(bus)("a").subscribe({});

		expect(() => bus.emit("a", 1)).not.toThrow();
	});

	it("only sees its own event", () => {
		const bus = createBus<Events>();
		const handler = vi.fn();
		createObserve(bus)("b").subscribe(handler);
		bus.emit("a", 1);

		expect(handler).not.toHaveBeenCalled();
	});

	it("stops after unsubscribe", () => {
		const bus = createBus<Events>();
		const handler = vi.fn();
		const sub = createObserve(bus)("a").subscribe(handler);
		bus.emit("a", 1);
		sub.unsubscribe();
		bus.emit("a", 2);

		expect(handler).toHaveBeenCalledTimes(1);
	});

	it("supports many subscribers", () => {
		const bus = createBus<Events>();
		const first = vi.fn();
		const second = vi.fn();
		const observable = createObserve(bus)("a");
		observable.subscribe(first);
		const sub = observable.subscribe(second);
		sub.unsubscribe();
		bus.emit("a", 1);

		expect(first).toHaveBeenCalledTimes(1);
		expect(second).not.toHaveBeenCalled();
	});

	it("is interop-observable: returns itself from the observable symbol", () => {
		const observable = createObserve(createBus<Events>())("a");

		expect(observable[$$observable]?.()).toBe(observable);
	});

	it("uses the standard key when there is no Symbol.observable", () => {
		expect($$observable).toBe("@@observable");
	});
});

describe("Subject", () => {
	it("delivers the payloads of its event to a function observer", () => {
		const bus = createBus<Events>();
		const seen: number[] = [];
		const subject = new Subject(bus, "a");
		subject.subscribe((value) => seen.push(value));
		bus.emit("a", 1);
		bus.emit("a", 2);

		expect(seen).toEqual([1, 2]);
	});

	it("delivers the payloads to an observer object", () => {
		const bus = createBus<Events>();
		const next = vi.fn();
		new Subject(bus, "a").subscribe({ next });
		bus.emit("a", 1);

		expect(next.mock.calls[0]?.[0]).toBe(1);
	});

	it("unsubscribe ends one subscription", () => {
		const bus = createBus<Events>();
		const first = vi.fn();
		const second = vi.fn();
		const subject = new Subject(bus, "a");
		const subscription = subject.subscribe(first);
		subject.subscribe(second);
		subscription.unsubscribe();
		bus.emit("a", 1);

		expect(first).not.toHaveBeenCalled();
		expect(second).toHaveBeenCalledTimes(1);
	});

	it("loses the events that came before subscribe", () => {
		const bus = createBus<Events>();
		const listener = vi.fn();
		const subject = new Subject(bus, "a");
		bus.emit("a", 1);
		subject.subscribe(listener);

		expect(listener).not.toHaveBeenCalled();
	});

	it("next reaches the listeners of the bus and the subscribers", () => {
		const bus = createBus<Events>();
		const handler = vi.fn();
		const listener = vi.fn();
		const subject = new Subject(bus, "a");
		bus.on("a", handler);
		subject.subscribe(listener);
		subject.next(5);

		expect(handler.mock.calls[0]?.[0]).toBe(5);
		expect(listener).toHaveBeenCalledWith(5);
	});

	it("a late subscriber gets no old value", () => {
		const bus = createBus<Events>();
		const listener = vi.fn();
		const subject = new Subject(bus, "a");
		subject.next(1);
		subject.subscribe(listener);

		expect(listener).not.toHaveBeenCalled();
	});

	it("next can be taken off the subject", () => {
		const bus = createBus<Events>();
		const handler = vi.fn();
		bus.on("a", handler);
		const { next } = new Subject(bus, "a");
		next(7);

		expect(handler.mock.calls[0]?.[0]).toBe(7);
	});

	it("returns itself from the observable symbol", () => {
		const subject = new Subject(createBus<Events>(), "a");

		expect(subject[$$observable]?.()).toBe(subject);
	});

	it("a subclass fixes the event and is still a Subject", () => {
		class TypedText extends Subject<Events, "b"> {
			constructor(bus: ReturnType<typeof createBus<Events>>) {
				super(bus, "b");
			}
		}
		const bus = createBus<Events>();
		const handler = vi.fn();
		bus.on("b", handler);
		const subject = new TypedText(bus);
		subject.next("text");

		expect(subject).toBeInstanceOf(Subject);
		expect(handler.mock.calls[0]?.[0]).toBe("text");
	});

	it("a subclass can override next, also when next is taken off", () => {
		class Trimmed extends Subject<Events, "b"> {
			override next(payload: string): void {
				super.next(payload.trim());
			}
		}
		const bus = createBus<Events>();
		const handler = vi.fn();
		bus.on("b", handler);
		const { next } = new Trimmed(bus, "b");
		next(" a ");

		expect(handler.mock.calls[0]?.[0]).toBe("a");
	});
});

describe("Subject over an instance of a class with a bus", () => {
	type ServiceEvents = { ping: number };

	const setup = () => {
		const bus = createBus<ServiceEvents>();
		class Service {
			declare on: BusMethods<typeof bus>["on"];
			declare emit: BusMethods<typeof bus>["emit"];
			readonly received: number[] = [];
			readonly stream: Subject<ServiceEvents, "ping">;

			constructor() {
				// made in the constructor of the base class, before dispose() could be called
				this.stream = new Subject(this, "ping");
				this.stream.subscribe((value) => this.received.push(value));
			}
		}

		return { bus, Extended: extendBus(bus, Service) };
	};

	it("dispose ends the subscription of the instance", () => {
		const { bus, Extended } = setup();
		const service = new Extended();
		bus.emit("ping", 1);
		service.dispose();
		bus.emit("ping", 2);

		expect(service.received).toEqual([1]);
	});

	it("does not touch the subscription of another instance", () => {
		const { bus, Extended } = setup();
		const first = new Extended();
		const second = new Extended();
		first.dispose();
		bus.emit("ping", 1);

		expect(first.received).toEqual([]);
		expect(second.received).toEqual([1]);
	});

	it("works for a class decorated with WithBus", () => {
		const bus = createBus<ServiceEvents>();
		class Decorated {
			declare on: BusMethods<typeof bus>["on"];
			declare emit: BusMethods<typeof bus>["emit"];
			readonly received: number[] = [];

			constructor() {
				new Subject(this, "ping").subscribe((value) =>
					this.received.push(value),
				);
			}
		}
		const Extended = WithBus(bus)(Decorated);
		const instance = new Extended();
		bus.emit("ping", 1);
		instance.dispose();
		bus.emit("ping", 2);

		expect(instance.received).toEqual([1]);
	});
});
