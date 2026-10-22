// Retry a flaky request: the pause grows, has a cap, and is spread by jitter.
import { createBus } from "nanoeffects";
import { backoff, retry } from "nanoeffects/effects";
import { latest } from "nanoeffects/policies";

type User = { id: number; name: string };
type Events = {
	load: number;
};

declare const api: {
	user(id: number, options: { signal: AbortSignal }): Promise<User>;
};

export const bus = createBus<Events>();

const loadUser = (id: number, { signal }: { signal: AbortSignal }) =>
	api.user(id, { signal });

// latest — a newer load aborts the older one, and its retries with it
// retry — up to 5 attempts; backoff — pause 200, 400, 800, … ms, at most 5 s, randomised
bus.on(
	"load",
	latest(
		retry(loadUser, {
			times: 5,
			delay: backoff({ base: 200, max: 5000, jitter: true }),
		}),
	),
);

bus.emit("load", 1);
