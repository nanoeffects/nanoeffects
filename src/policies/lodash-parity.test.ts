// The reference is lodash itself: `throttle` and `debounce` must call `fn` at the
// same moments, with the same arguments, as lodash does for the same calls.
import lodashDebounce from "lodash/debounce.js";
import lodashThrottle from "lodash/throttle.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHarness, type TestEvents } from "../test-helpers";
import { debounce } from "./debounce";
import { throttle } from "./throttle";

const mulberry32 = (seed: number) => {
	let a = seed;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
};

type Log = Array<[number, number]>;

const drive = async (
	make: (record: (n: number) => void) => (n: number) => void,
	gaps: number[],
) => {
	vi.useFakeTimers();
	vi.setSystemTime(0);
	const log: Log = [];
	const call = make((n) => {
		log.push([Date.now(), n]);
	});
	for (const [i, gap] of gaps.entries()) {
		await vi.advanceTimersByTimeAsync(gap);
		call(i);
	}
	await vi.advanceTimersByTimeAsync(2000);
	vi.useRealTimers();
	return log;
};

describe("throttle parity with lodash", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	for (const leading of [true, false]) {
		for (const trailing of [true, false]) {
			it(`leading ${leading}, trailing ${trailing}`, async () => {
				for (let seed = 1; seed <= 300; seed++) {
					const random = mulberry32(seed * 7919);
					const wait = 20 + Math.floor(random() * 100);
					const gaps = Array.from(
						{ length: 5 + Math.floor(random() * 30) },
						() => {
							const r = random();
							return r < 0.2 ? 0 : Math.floor(random() * wait * 1.6);
						},
					);

					const expected = await drive(
						(record) => lodashThrottle(record, wait, { leading, trailing }),
						gaps,
					);
					const actual = await drive((record) => {
						const h = createHarness();
						const t = throttle<number, TestEvents, void>(
							wait,
							(n) => record(n),
							{
								leading,
								trailing,
							},
						);
						return (n) => {
							void t(n, h.ctx());
						};
					}, gaps);

					expect(
						actual,
						`seed ${seed}, wait ${wait}, gaps ${gaps.join(",")}`,
					).toEqual(expected);
				}
			});
		}
	}
});

describe("debounce parity with lodash", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	for (const leading of [true, false]) {
		for (const trailing of [true, false]) {
			it(`leading ${leading}, trailing ${trailing}`, async () => {
				for (let seed = 1; seed <= 300; seed++) {
					const random = mulberry32(seed * 104729);
					const wait = 20 + Math.floor(random() * 100);
					const gaps = Array.from(
						{ length: 5 + Math.floor(random() * 30) },
						() => {
							const r = random();
							return r < 0.2 ? 0 : Math.floor(random() * wait * 1.6);
						},
					);

					const expected = await drive(
						(record) => lodashDebounce(record, wait, { leading, trailing }),
						gaps,
					);
					const actual = await drive((record) => {
						const h = createHarness();
						const d = debounce<number, TestEvents, void>(
							wait,
							(n) => record(n),
							{
								leading,
								trailing,
							},
						);
						return (n) => {
							void d(n, h.ctx());
						};
					}, gaps);

					expect(
						actual,
						`seed ${seed}, wait ${wait}, gaps ${gaps.join(",")}`,
					).toEqual(expected);
				}
			});
		}
	}
});

describe("a keyed throttle behaves like an unkeyed one", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("forgetting an idle key never changes when fn runs", async () => {
		for (let seed = 1; seed <= 300; seed++) {
			const random = mulberry32(seed * 15485863);
			const wait = 20 + Math.floor(random() * 100);
			const gaps = Array.from({ length: 5 + Math.floor(random() * 30) }, () => {
				const r = random();
				return r < 0.2 ? 0 : Math.floor(random() * wait * 3);
			});
			const make =
				(keyed: boolean) =>
				(record: (n: number) => void): ((n: number) => void) => {
					const h = createHarness();
					const t = throttle<number, TestEvents, void>(wait, (n) => record(n), {
						...(keyed ? { key: () => "same" } : {}),
					});
					return (n) => {
						void t(n, h.ctx());
					};
				};

			const plain = await drive(make(false), gaps);
			const keyed = await drive(make(true), gaps);

			expect(
				keyed,
				`seed ${seed}, wait ${wait}, gaps ${gaps.join(",")}`,
			).toEqual(plain);
		}
	});
});
