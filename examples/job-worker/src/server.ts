import Fastify from "fastify";
import type { Email } from "./mailer";
import type { Worker } from "./worker";

type Options = { worker: Worker };

// the body must be { to, subject }, both strings; Fastify answers 400 for anything else
const emailBody = {
	type: "object",
	required: ["to", "subject"],
	properties: { to: { type: "string" }, subject: { type: "string" } },
} as const;

export const buildServer = ({ worker }: Options) => {
	const app = Fastify();

	app.post<{ Body: Email }>(
		"/emails",
		{ schema: { body: emailBody } },
		async (request, reply) => {
			if (!worker.isAccepting()) {
				return reply.code(503).send({ error: "shutting down, no new emails" });
			}
			// accept — queues the email and returns its id; the send happens later
			const id = worker.accept(request.body);

			return reply.code(202).send({ id });
		},
	);

	app.get("/stats", async () => worker.counts());

	return app;
};
