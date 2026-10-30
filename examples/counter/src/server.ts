import type { WithSignal } from "nanoeffects";
import { delay } from "nanoeffects/effects";

// A fake server: replace it with your own requests. Both calls take 300 ms and stop when the
// signal aborts, as a request of a real client does.

let failures = 0;

// Fails on its first two calls and answers on the third, then starts over. A click that is
// replaced half way leaves the count where it was, which is fine for a demo.
export const flaky = async ({ signal }: WithSignal) => {
	await delay({ signal }, 300);
	failures += 1;

	if (failures < 3) {
		throw new Error(`The server failed (try ${failures})`);
	}

	failures = 0;
};

// Never answers.
export const broken = async ({ signal }: WithSignal) => {
	await delay({ signal }, 300);
	throw new Error("The server is down");
};
