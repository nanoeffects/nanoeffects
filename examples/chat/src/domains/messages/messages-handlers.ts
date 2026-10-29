import { retry } from "nanoeffects/effects";
import { latest, queue } from "nanoeffects/policies";
import { api, HttpError } from "../../api";
import type { SendCall } from "./messages";

// The work of the messages domain.

// latest — a load for a newer room aborts the older one, and the older result is never delivered
export const fetchHistory = latest((roomId: string, { signal }) =>
	api.loadHistory(roomId, { signal }),
);

// The outcome `fail` carries only the error, not the call. To know which message failed, the
// error carries the local id.
export class SendFailed extends Error {
	localId: string;

	constructor(localId: string, cause: unknown) {
		super(cause instanceof Error ? cause.message : String(cause));
		this.localId = localId;
	}
}

// A 400 is an answer: asking again gives the same answer. A 503 or a lost connection may pass.
const isWorthRetrying = (error: unknown) =>
	!(error instanceof HttpError && error.status < 500);

// retry — try a failed send again, up to 3 attempts, 200 ms apart, unless the answer was a "no"
const attempt = retry(
	async (call: SendCall, { signal }) => {
		const message = await api.send(call.roomId, call.text, { signal });
		return { localId: call.localId, message };
	},
	{ times: 3, delay: 200, shouldRetry: isWorthRetrying },
);

// queue — messages go out one after another, in the order they were sent
export const deliver = queue(async (call: SendCall, ctx) => {
	try {
		return await attempt(call, ctx);
	} catch (error) {
		throw new SendFailed(call.localId, error);
	}
});
