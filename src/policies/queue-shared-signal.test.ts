import { describe, expect, it } from "vitest";
import { actionsPlugin, createJob } from "../actions";
import { createBus } from "../core/bus";
import { signalPlugin } from "../signal";
import { queue } from "./queue";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

// One signal given to several emits aborts all their tasks at once. The waiting calls are
// aborted too, so none of them may start: a call that is aborted before its turn sends nothing.
describe("queue with one signal for several calls", () => {
	const setup = (concurrency: number) => {
		const bus = createBus().use(signalPlugin());
		const started: number[] = [];
		const outcomes: string[] = [];
		const send = createJob<number, void>("send");
		// the handler is bound in the registry, where the job learns from the policy when a call starts
		const commands = bus.use(actionsPlugin());
		commands.handle(
			send,
			queue(
				(payload: number, { signal }) => {
					started.push(payload);
					return new Promise<void>((_resolve, reject) => {
						signal.addEventListener("abort", () => reject(signal.reason));
					});
				},
				{ concurrency },
			),
		);
		bus.on(send.pending, (payload) => outcomes.push(`pending ${payload}`));
		bus.on(send.cancel, () => outcomes.push("cancel"));
		const controller = new AbortController();
		const { signal } = controller;
		for (let payload = 1; payload <= 5; payload += 1) {
			bus.emit(send(payload), { signal });
		}

		return { controller, started, outcomes };
	};

	it("starts no waiting call when the signal aborts", async () => {
		const { controller, started } = setup(1);
		controller.abort();
		await flush();

		expect(started).toEqual([1]);
	});

	it("cancels only the calls that were running", async () => {
		const { controller, outcomes } = setup(2);
		controller.abort();
		await flush();

		expect(outcomes).toEqual(["pending 1", "pending 2", "cancel", "cancel"]);
	});
});
