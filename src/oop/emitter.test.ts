import { describe, expect, it, vi } from "vitest";
import { Subject } from "../observable";
import { Emitter, On, Once } from ".";

type Events = { ping: number; pong: string };

describe("Emitter", () => {
	describe("the methods", () => {
		it("gives a subclass on and emit that act on one bus", () => {
			class Video extends Emitter<Events> {}
			const video = new Video();
			const handler = vi.fn();
			video.on("ping", handler);
			video.emit("ping", 1);

			expect(handler).toHaveBeenCalledWith(
				1,
				expect.objectContaining({ type: "ping" }),
			);
		});

		it("runs a once handler one time and takes a handler away with off", () => {
			class Video extends Emitter<Events> {}
			const video = new Video();
			const onceHandler = vi.fn();
			const offHandler = vi.fn();
			video.once("ping", onceHandler);
			video.on("ping", offHandler);
			video.off("ping", offHandler);
			video.emit("ping", 1);
			video.emit("ping", 2);

			expect(onceHandler).toHaveBeenCalledTimes(1);
			expect(offHandler).not.toHaveBeenCalled();
		});

		it("lets the methods be taken off the instance", () => {
			class Video extends Emitter<Events> {}
			const { on, emit } = new Video();
			const handler = vi.fn();
			on("ping", handler);
			emit("ping", 1);

			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("keeps a member of the subclass", () => {
			const log: string[] = [];
			class Video extends Emitter<Events> {
				override dispose(): void {
					log.push("own dispose");
				}
			}
			// TypeScript does not let a subclass declare on, once, off or emit as a method;
			// at run time a method of the prototype of the subclass is the one that is bound
			const ownEmit = vi.fn();
			Object.defineProperty(Video.prototype, "emit", { value: ownEmit });
			const video = new Video();
			const handler = vi.fn();
			video.on("ping", handler);
			video.emit("ping", 1);
			const { emit } = video;
			emit("ping", 2);
			video.dispose();

			expect(ownEmit).toHaveBeenCalledTimes(2);
			expect(handler).not.toHaveBeenCalled();
			expect(log).toEqual(["own dispose"]);
		});
	});

	describe("replacing a member", () => {
		it("lets a subclass replace emit with an arrow property", () => {
			const sent: number[] = [];
			class Video extends Emitter<Events> {
				override emit = (...args: unknown[]) => {
					sent.push(Number(args[1]));
				};
			}
			const video = new Video();
			const handler = vi.fn();
			video.on("ping", handler);
			const { emit } = video;
			emit("ping", 1);

			expect(sent).toEqual([1]);
			expect(handler).not.toHaveBeenCalled();
		});

		it("binds on, once, off and emit to the instance", () => {
			class Video extends Emitter<Events> {}
			const first = new Video();
			const second = new Video();
			const { on, off } = first;
			const handler = vi.fn();
			on("ping", handler);
			second.emit("ping", 1);

			expect(handler).not.toHaveBeenCalled();

			first.emit("ping", 2);
			off("ping", handler);
			first.emit("ping", 3);

			expect(handler).toHaveBeenCalledTimes(1);
		});
	});

	describe("a bus for each instance", () => {
		it("does not let two instances hear each other", () => {
			class Video extends Emitter<Events> {}
			const first = new Video();
			const second = new Video();
			const handler = vi.fn();
			first.on("ping", handler);
			second.emit("ping", 1);

			expect(handler).not.toHaveBeenCalled();

			first.emit("ping", 2);

			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("keeps instances of two classes apart", () => {
			class One extends Emitter<Events> {}
			class Two extends Emitter<Events> {}
			const handler = vi.fn();
			new Two().on("ping", handler);
			new One().emit("ping", 1);

			expect(handler).not.toHaveBeenCalled();
		});

		it("keeps a class and its subclass apart", () => {
			class Parent extends Emitter<Events> {}
			class Child extends Parent {}
			const parent = new Parent();
			const child = new Child();
			const parentHandler = vi.fn();
			const childHandler = vi.fn();
			parent.on("ping", parentHandler);
			child.on("ping", childHandler);
			child.emit("ping", 1);

			expect(childHandler).toHaveBeenCalledTimes(1);
			expect(parentHandler).not.toHaveBeenCalled();
		});

		it("returns the same bus on every read, and not the bus of another instance", () => {
			class Video extends Emitter<Events> {}
			const video = new Video();

			expect(video.bus).toBe(video.bus);
			expect(video.bus).not.toBe(new Video().bus);
		});

		it("has no static bus", () => {
			expect("bus" in Emitter).toBe(false);
		});

		it("makes the bus in the constructor of a parent class", () => {
			const handler = vi.fn();
			class Parent extends Emitter<Events> {
				constructor() {
					super();
					this.on("ping", handler);
				}
			}
			class Child extends Parent {
				readonly name = "child";
			}
			const child = new Child();
			child.emit("ping", 1);

			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("has no methods of plugins that are used on the bus later", () => {
			class Video extends Emitter<Events> {}
			const video = new Video();
			video.bus.use((bus) => Object.assign(bus, { extra: () => 1 }));

			expect(Reflect.has(video, "extra")).toBe(false);
		});
	});

	describe("dispose", () => {
		it("ends the subscriptions of the instance and nothing else", () => {
			class Video extends Emitter<Events> {}
			const first = new Video();
			const second = new Video();
			const firstHandler = vi.fn();
			const secondHandler = vi.fn();
			first.on("ping", firstHandler);
			first.once("pong", firstHandler);
			second.on("ping", secondHandler);
			first.dispose();
			first.emit("ping", 1);
			first.emit("pong", "a");
			second.emit("ping", 2);

			expect(firstHandler).not.toHaveBeenCalled();
			expect(secondHandler).toHaveBeenCalledTimes(1);
		});

		it("ends a subscription made in the constructor of a subclass", () => {
			const handler = vi.fn();
			class Video extends Emitter<Events> {
				constructor() {
					super();
					this.on("ping", handler);
				}
			}
			const video = new Video();
			video.dispose();
			video.emit("ping", 1);

			expect(handler).not.toHaveBeenCalled();
		});

		it("can be called twice, and Symbol.dispose does the same", () => {
			class Video extends Emitter<Events> {}
			const video = new Video();
			const handler = vi.fn();
			video.on("ping", handler);
			video[Symbol.dispose]();

			expect(() => video.dispose()).not.toThrow();

			video.emit("ping", 1);

			expect(handler).not.toHaveBeenCalled();
		});

		it("ends a Subject that is made over the instance", () => {
			class Video extends Emitter<Events> {
				readonly ping = new Subject(this, "ping");
			}
			const video = new Video();
			const listener = vi.fn();
			video.ping.subscribe(listener);
			video.ping.next(1);
			video.dispose();
			video.emit("ping", 2);

			expect(listener).toHaveBeenCalledTimes(1);
		});
	});

	describe("decorated methods", () => {
		const received: Array<[string, number]> = [];

		class Video extends Emitter<Events> {
			name = "video";

			handlePing(value: number): void {
				received.push([this.name, value]);
			}

			handleOnce(value: number): void {
				received.push(["once", value]);
			}
		}
		Reflect.apply(On("ping"), null, [
			Video.prototype.handlePing,
			{ kind: "method", name: "handlePing" },
		]);
		Reflect.apply(Once("ping"), null, [
			Video.prototype.handleOnce,
			{ kind: "method", name: "handleOnce" },
		]);

		it("runs a decorated method on the instance, and a once one time", () => {
			received.length = 0;
			const video = new Video();
			video.emit("ping", 1);
			video.emit("ping", 2);

			expect(received).toEqual([
				["video", 1],
				["once", 1],
				["video", 2],
			]);
		});

		it("ends them with dispose and keeps each instance on its own bus", () => {
			received.length = 0;
			const first = new Video();
			const second = new Video();
			first.dispose();
			first.emit("ping", 1);

			expect(received).toEqual([]);

			second.emit("ping", 2);

			expect(received).toEqual([
				["video", 2],
				["once", 2],
			]);
		});
	});
});
