// A test helper that proves a handler stops: it cancels the handler at every step and reports the requests that
// kept running. It does not read the code, so it finds what a linter cannot: a function that is given the signal
// and ignores it. The transport is `fetch`; for another client (axios, a driver) stub that client the same way.

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Replaces fetch with a server that answers after `ms` and stops its answer when the request's signal aborts.
// Every call is recorded with the signal it got (none, or one) and whether it has finished.
export const stubFetch = (ms = 10) => {
	const original = globalThis.fetch;
	const requests = [];
	globalThis.fetch = (url, init) =>
		new Promise((resolve, reject) => {
			const signal = init?.signal;
			const request = { url: String(url), signal, settled: false };
			requests.push(request);
			const timer = setTimeout(() => {
				request.settled = true;
				resolve(new Response("[]"));
			}, ms);
			signal?.addEventListener("abort", () => {
				request.settled = true;
				clearTimeout(timer);
				reject(signal.reason);
			});
		});

	return {
		requests,
		restore: () => {
			globalThis.fetch = original;
		},
	};
};

// Cancels the handler during each of its steps, one run for each step, and returns the requests that kept running
// after the cancel: they were in flight, and they got no signal or a signal that did not abort with the handler.
// `start(value)` emits to a bus with the handler under a policy that a newer call cancels, such as `latest`.
export const requestsThatKeptRunning = async (start, { ms = 10, maxSteps = 20 } = {}) => {
	const kept = [];
	for (let step = 0; step < maxSteps; step += 1) {
		const server = stubFetch(ms);
		try {
			start("first");
			// wait until the first call is in the middle of its request number `step`
			await pause(step * ms + ms / 2);
			const inFlight = server.requests.filter((request) => !request.settled);
			if (inFlight.length === 0) {
				// the first call has no request left: it ran through all its steps
				break;
			}
			// a newer call cancels the first one at once
			start("second");
			for (const request of inFlight) {
				if (!request.signal?.aborted) {
					kept.push({ step, url: request.url, hadSignal: Boolean(request.signal) });
				}
			}
			await pause(ms * 2);
		} finally {
			server.restore();
		}
	}

	return kept;
};
