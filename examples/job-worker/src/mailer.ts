// A fake mailer that misbehaves on a known schedule, so every outcome of the worker can be seen
// without a network:
// - every fourth attempt fails with a 503: "try again later"
// - a subject that starts with /hang never gets an answer
// - a subject that starts with /bad is refused at once with a 400: "no"
import type { WithSignal } from "nanoeffects";
import { delay } from "nanoeffects/effects";

export type Email = { to: string; subject: string };

export class MailError extends Error {
	status: number;

	constructor(status: number, message: string) {
		super(message);
		this.status = status;
	}
}

export type Mailer = {
	send: (email: Email, options: WithSignal) => Promise<void>;
};

type MailerOptions = {
	// the time one send takes, in ms
	sendMs?: number;
	// whether the attempt with this number (from 1) fails with a 503
	shouldFail?: (attempt: number) => boolean;
};

const everyFourth = (attempt: number) => attempt % 4 === 0;

// stays pending until the signal aborts, and then rejects like a request that was cancelled
const hang = ({ signal }: WithSignal) =>
	new Promise<never>((_resolve, reject) => {
		signal.addEventListener("abort", () => reject(signal.reason));
	});

export const createMailer = ({
	sendMs = 300,
	shouldFail = everyFourth,
}: MailerOptions = {}): Mailer => {
	let attempts = 0;

	return {
		async send(email, { signal }) {
			attempts += 1;

			if (email.subject.startsWith("/hang")) {
				return hang({ signal });
			}
			if (email.subject.startsWith("/bad")) {
				throw new MailError(400, "the address was refused");
			}
			// the send takes some time; an abort ends the wait with the abort reason
			await delay({ signal }, sendMs);
			if (shouldFail(attempts)) {
				throw new MailError(503, "the mail server is busy");
			}
		},
	};
};
