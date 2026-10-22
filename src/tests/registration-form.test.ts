import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRegistration } from "../../examples/registration-form";

// a call of the fake api that the test settles by hand
type Call<T> = {
	signal: AbortSignal;
	resolve: (value: T) => void;
	reject: (error: unknown) => void;
};

const startCall = <T>(signal: AbortSignal) => {
	let settle = { resolve: (_value: T) => {}, reject: (_error: unknown) => {} };
	const promise = new Promise<T>((resolve, reject) => {
		settle = { resolve, reject };
	});
	return { promise, call: { signal, ...settle } satisfies Call<T> };
};

const setup = () => {
	const checks: (Call<boolean> & { name: string })[] = [];
	const signUps: Call<string>[] = [];
	const api = {
		usernameAvailable: (name: string, { signal }: { signal: AbortSignal }) => {
			const { promise, call } = startCall<boolean>(signal);
			checks.push({ ...call, name });
			return promise;
		},
		signUp: (_form: unknown, { signal }: { signal: AbortSignal }) => {
			const { promise, call } = startCall<string>(signal);
			signUps.push(call);
			return promise;
		},
	};
	const bus = createRegistration(api);
	const checked: unknown[] = [];
	const succeeded: string[] = [];
	const failed: string[] = [];
	bus.on("username/checked", (result) => checked.push(result));
	bus.on("form/succeeded", (user) => succeeded.push(user));
	bus.on("form/failed", (message) => failed.push(message));
	return { bus, checks, signUps, checked, succeeded, failed };
};

const form = { name: "anna", password: "secret" };

describe("registration form", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("checks the name once for fast typing", async () => {
		const { bus, checks } = setup();

		bus.emit("username/typed", "a");
		bus.emit("username/typed", "an");
		bus.emit("username/typed", "anna");
		await vi.advanceTimersByTimeAsync(300);

		expect(checks.map(({ name }) => name)).toEqual(["anna"]);
	});

	it("aborts the check of an older name and drops its late answer", async () => {
		const { bus, checks, checked } = setup();

		bus.emit("username/typed", "ann");
		await vi.advanceTimersByTimeAsync(300);
		bus.emit("username/typed", "anna");
		await vi.advanceTimersByTimeAsync(300);
		checks[0]?.resolve(true);
		checks[1]?.resolve(false);
		await vi.advanceTimersByTimeAsync(0);

		expect(checks[0]?.signal.aborted).toBe(true);
		expect(checked).toEqual([{ name: "anna", available: false }]);
	});

	it("ignores a second submit while the first is running", async () => {
		const { bus, signUps, succeeded } = setup();

		bus.emit("form/submitted", form);
		bus.emit("form/submitted", form);
		signUps[0]?.resolve("anna");
		await vi.advanceTimersByTimeAsync(0);

		expect(signUps).toHaveLength(1);
		expect(succeeded).toEqual(["anna"]);
	});

	it("retries a network error", async () => {
		const { bus, signUps, succeeded, failed } = setup();

		bus.emit("form/submitted", form);
		signUps[0]?.reject(new TypeError("Failed to fetch"));
		await vi.advanceTimersByTimeAsync(500);
		signUps[1]?.reject(new TypeError("Failed to fetch"));
		await vi.advanceTimersByTimeAsync(500);
		signUps[2]?.resolve("anna");
		await vi.advanceTimersByTimeAsync(0);

		expect(signUps).toHaveLength(3);
		expect(succeeded).toEqual(["anna"]);
		expect(failed).toEqual([]);
	});

	it("does not retry an error that is not a network error", async () => {
		const { bus, signUps, succeeded, failed } = setup();

		bus.emit("form/submitted", form);
		signUps[0]?.reject(new Error("Name is taken"));
		await vi.advanceTimersByTimeAsync(1000);

		expect(signUps).toHaveLength(1);
		expect(succeeded).toEqual([]);
		expect(failed).toEqual(["Name is taken"]);
	});

	it("aborts running work when the form is closed", async () => {
		const { bus, checks, signUps, failed } = setup();

		bus.emit("username/typed", "anna");
		await vi.advanceTimersByTimeAsync(300);
		bus.emit("form/submitted", form);
		bus.emit("form/closed");

		expect(checks[0]?.signal.aborted).toBe(true);
		expect(signUps[0]?.signal.aborted).toBe(true);
		await vi.advanceTimersByTimeAsync(0);
		expect(failed).toEqual([]);
	});
});
