// A test helper that proves a handler stops: it cancels the handler at every step and reports the requests that
// kept running. It does not read the code, so it finds what a linter cannot: a function that is given the signal
// and ignores it. The transport is `fetch`; for another client (axios, a driver) stub that client the same way.

// one turn of the event loop: enough for the promises of a handler to reach their next await
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

// Replaces fetch with a server that answers only when the test lets it, and stops when the request's signal aborts.
// Every call is recorded with the signal it got (none, or one) and whether it has finished. No timers are involved,
// so the result does not depend on how fast the machine is.
export const stubFetch = () => {
	const original = globalThis.fetch;
	const requests = [];
	globalThis.fetch = (url, init) =>
		new Promise((resolve, reject) => {
			const signal = init?.signal;
			const request = {
				url: String(url),
				signal,
				settled: false,
				answer: () => {
					request.settled = true;
					resolve(new Response("[]"));
				},
			};
			requests.push(request);
			signal?.addEventListener("abort", () => {
				request.settled = true;
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
// Step N: the first N requests are answered, so the handler is waiting for the next one; then a newer call cancels it.
export const requestsThatKeptRunning = async (start, { maxSteps = 20 } = {}) => {
	const kept = [];
	for (let step = 0; step < maxSteps; step += 1) {
		const server = stubFetch();
		try {
			start("first");
			await settle();
			for (let answered = 0; answered < step; answered += 1) {
				server.requests[answered]?.answer();
				await settle();
			}
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
			await settle();
		} finally {
			server.restore();
		}
	}

	return kept;
};
