import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app, bus } from "../../examples/chat-widget/src/bus";
import {
	closeRequested,
	type Line,
	messageAdded,
	messageSent,
} from "../../examples/chat-widget/src/chat";
import { chatModule } from "../../examples/chat-widget/src/chat-module";
import { history } from "../../examples/chat-widget/src/history";

describe("examples/chat-widget", () => {
	const keys = new EventTarget();
	let lines: Line[];
	let closes: number;
	let stop: (() => void) | null;
	const unbinds: Array<() => void> = [];

	const press = (key: string) => {
		const event = Object.assign(new Event("keydown"), { key });
		keys.dispatchEvent(event);
	};

	beforeEach(() => {
		vi.useFakeTimers();
		vi.stubGlobal("document", keys);
		lines = [];
		closes = 0;
		history.length = 0;
		stop = null;
		unbinds.push(bus.on(messageAdded, (line) => lines.push(line)));
		unbinds.push(
			bus.on(closeRequested, () => {
				closes += 1;
				stop?.();
				stop = null;
			}),
		);
	});

	afterEach(() => {
		stop?.();
		for (const unbind of unbinds.splice(0)) {
			unbind();
		}
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	it("answers a text while the chat is open", async () => {
		stop = app.mount(chatModule);
		bus.emit(messageSent("hello"));
		await vi.advanceTimersByTimeAsync(1000);
		expect(lines.map((line) => line.from)).toEqual(["user", "bot"]);
	});

	it("leaves no listener of the module when the chat is closed", () => {
		expect(bus.get(messageSent.type)).toHaveLength(0);
		stop = app.mount(chatModule);
		expect(bus.get(messageSent.type)).toHaveLength(1);
		stop();
		stop = null;
		expect(bus.get(messageSent.type)).toHaveLength(0);
	});

	it("ignores texts and Escape while it is closed", async () => {
		bus.emit(messageSent("hello"));
		press("Escape");
		await vi.advanceTimersByTimeAsync(20_000);
		expect(lines).toEqual([]);
		expect(closes).toBe(0);
	});

	it("closes on Escape and stops everything it started", async () => {
		stop = app.mount(chatModule);
		press("Escape");
		expect(closes).toBe(1);
		press("Escape");
		expect(closes).toBe(1);
		await vi.advanceTimersByTimeAsync(20_000);
		expect(lines).toEqual([]);
	});

	it("aborts a running request when the chat is closed", async () => {
		stop = app.mount(chatModule);
		bus.emit(messageSent("slow"));
		await vi.advanceTimersByTimeAsync(100);
		expect(lines.map((line) => line.from)).toEqual(["user"]);
		stop?.();
		stop = null;
		await vi.advanceTimersByTimeAsync(20_000);
		expect(lines.map((line) => line.from)).toEqual(["user"]);
	});

	it("polls the operator only while it is open", async () => {
		stop = app.mount(chatModule);
		await vi.advanceTimersByTimeAsync(60_000);
		expect(lines.map((line) => line.from)).toContain("operator");
		stop?.();
		stop = null;
		const seen = lines.length;
		await vi.advanceTimersByTimeAsync(60_000);
		expect(lines.length).toBe(seen);
	});
});
