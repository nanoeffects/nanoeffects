import { createBus } from "nanoeffects";
import { createCommand, createModule, modulePlugin } from "nanoeffects/actions";
import { delay, race, retry, take, timeout } from "nanoeffects/effects";
import { queue } from "nanoeffects/policies";
import { signalPlugin } from "nanoeffects/signal";
import { idle, sendEmail } from "./jobs";
import { type Email, MailError, type Mailer } from "./mailer";

type WorkerOptions = {
	mailer: Mailer;
	// how long a shutdown waits for the emails in flight, in ms
	drainMs?: number;
	log?: (message: string) => void;
};

export type Counts = {
	queued: number;
	running: number;
	sent: number;
	failed: number;
	cancelled: number;
};

// A 503 may pass later. A 400 is an answer, and a timeout would only repeat.
const isWorthRetrying = (error: unknown) =>
	error instanceof MailError && error.status >= 500;

// the pause before the next attempt grows: 200 ms, 400 ms, ...
const backoff = (attempt: number) => 200 * 2 ** (attempt - 1);

export const createWorker = ({
	mailer,
	drainMs = 5000,
	log = console.log,
}: WorkerOptions) => {
	// createBus — the event bus; signalPlugin — emit takes { signal }, so a shutdown can abort the calls
	const signal = signalPlugin();
	const bus = createBus().use(signal);

	// the signal that every email is given: aborting it cancels what is left
	const stopping = new AbortController();
	let accepting = true;
	let accepted = 0;
	let started = 0;
	let sent = 0;
	let failed = 0;
	let cancelled = 0;
	// emails that were still waiting when the shutdown aborted: they never start, so the job
	// sends no outcome for them
	let abandoned = 0;
	let lastId = 0;

	const counts = (): Counts => ({
		queued: accepted - started - abandoned,
		running: started - sent - failed - cancelled,
		sent,
		failed,
		cancelled: cancelled + abandoned,
	});

	// One attempt to send, given the signal of its task
	const attempt = (email: Email, { signal }: { signal: AbortSignal }) =>
		mailer.send(email, { signal });

	// Read from the inside out:
	// timeout — one attempt may take 1 s; a mailer that does not answer fails
	// retry — up to 3 attempts, with a growing pause, only for a failure that may pass
	// queue — at most 3 emails are sent at once; the rest wait
	const deliver = queue(
		retry(timeout(1000, attempt), {
			times: 3,
			delay: backoff,
			shouldRetry: isWorthRetrying,
		}),
		{ concurrency: 3 },
	);

	// A job outcome closes a call; when nothing is left, say so, so a shutdown can stop waiting
	const worker = createModule("worker", (m) => {
		m.handle(sendEmail, deliver);

		const closed = () => {
			const { queued, running } = counts();
			if (queued + running === 0) {
				m.emit(idle());
			}
		};
		m.on(sendEmail.pending, () => {
			started += 1;
		});
		m.on(sendEmail.success, () => {
			sent += 1;
			closed();
		});
		m.on(sendEmail.fail, () => {
			failed += 1;
			closed();
		});
		m.on(sendEmail.cancel, () => {
			cancelled += 1;
			closed();
		});
	});
	bus.use(modulePlugin([worker]));

	// Queues one email and returns at once; the answer to the client does not wait for the send
	const accept = (email: Email) => {
		accepted += 1;
		lastId += 1;
		const call = sendEmail(email);
		bus.emit(call, { signal: stopping.signal });

		return String(lastId);
	};

	// The shutdown in three steps. It is a command, so its race can use take and delay.
	const stop = createCommand("worker/shutdown", async (_: undefined, ctx) => {
		accepting = false;
		log("1. not taking new emails");

		const { queued, running } = counts();
		if (queued + running > 0) {
			log(`2. waiting up to ${drainMs} ms for ${queued + running} email(s)`);
			// race — the first to finish wins: everything is sent, or the time is up
			await race(ctx, {
				drained: take(idle), // take without ctx: a starter
				deadline: delay(drainMs), // delay without ctx: a starter
			});
		} else {
			log("2. nothing in flight");
		}

		// Aborting the signal of the emits cancels what is left. A call that is running gets the
		// outcome `cancel` at once; a call that is still waiting is dropped without an outcome, and
		// the count of what was not started is how many that was.
		log("3. aborting what is left");
		stopping.abort();
		abandoned = accepted - started;

		return counts();
	});

	return {
		accept,
		counts,
		isAccepting: () => accepting,
		shutdown: () => bus.emit(stop(void 0)),
	};
};

export type Worker = ReturnType<typeof createWorker>;
