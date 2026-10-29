import { describe, expect, it } from "vitest";
import { createBus } from "../core/bus";
import { aliveCount, settleGarbage } from "../tests/test-helpers";
import { Emitter, extendBus, On } from ".";

type Events = { ping: number };

class Base {
	handled = 0;
	handle() {
		this.handled++;
	}
}
Reflect.apply(On("ping"), null, [
	Base.prototype.handle,
	{ kind: "method", name: "handle" },
]);

describe("extendBus: instances do not leak", () => {
	it("the check sees an instance that is still subscribed", async () => {
		const bus = createBus<Events>();
		const Service = extendBus(bus, Base);
		const refs: Array<WeakRef<object>> = [];
		const instance = new Service();
		refs.push(new WeakRef(instance));
		await settleGarbage();

		expect(aliveCount(refs)).toBe(1);
		expect(instance.handled).toBe(0);
	});

	it("a disposed instance and its handlers can be collected", async () => {
		const bus = createBus<Events>();
		const Service = extendBus(bus, Base);
		const refs: Array<WeakRef<object>> = [];
		const subscribe = () => {
			const instance = new Service();
			const handler = () => {};
			refs.push(new WeakRef(instance), new WeakRef(handler));
			instance.on("ping", handler);
			instance.once("ping", handler);
			instance.dispose();
		};
		for (let round = 0; round < 50; round++) {
			subscribe();
		}
		await settleGarbage();

		expect(aliveCount(refs)).toBe(0);
	});

	it("an instance whose subscriptions ended one by one can be collected", async () => {
		const bus = createBus<Events>();
		const Service = extendBus(bus, class {});
		const refs: Array<WeakRef<object>> = [];
		const subscribe = () => {
			const instance = new Service();
			const handler = () => {};
			refs.push(new WeakRef(instance), new WeakRef(handler));
			instance.on("ping", handler)();
			instance.once("ping", handler);
			bus.emit("ping", 1);
			instance.off("ping", handler);
		};
		for (let round = 0; round < 50; round++) {
			subscribe();
		}
		await settleGarbage();

		expect(aliveCount(refs)).toBe(0);
	});
});

describe("Emitter: instances do not leak", () => {
	it("a disposed instance, its bus and its handlers can be collected", async () => {
		class Video extends Emitter<Events> {}
		const refs: Array<WeakRef<object>> = [];
		const subscribe = () => {
			const video = new Video();
			const handler = () => {};
			refs.push(
				new WeakRef(video),
				new WeakRef(video.bus),
				new WeakRef(handler),
			);
			video.on("ping", handler);
			video.once("ping", handler);
			video.emit("ping", 1);
			video.dispose();
		};
		for (let round = 0; round < 50; round++) {
			subscribe();
		}
		await settleGarbage();

		expect(aliveCount(refs)).toBe(0);
	});

	it("an instance that was never disposed can be collected with its bus", async () => {
		class Video extends Emitter<Events> {}
		const refs: Array<WeakRef<object>> = [];
		const subscribe = () => {
			const video = new Video();
			refs.push(new WeakRef(video), new WeakRef(video.bus));
			video.on("ping", () => {});
		};
		for (let round = 0; round < 50; round++) {
			subscribe();
		}
		await settleGarbage();

		expect(aliveCount(refs)).toBe(0);
	});
});
