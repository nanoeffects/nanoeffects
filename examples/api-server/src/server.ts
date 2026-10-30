import Fastify from "fastify";
import { bus } from "./bus";
import { createProfile } from "./profile";
import { HttpError, type Upstream } from "./upstream";

// The HTTP side of the server: the routes, the status of a failure, and what happens when a
// client leaves or the process stops.

type Options = {
	upstream: Upstream;
	log?: (message: string) => void;
};

// One function from the error to the status: 404 stays a 404, a timeout is a 504, the rest a 502
const statusOf = (error: unknown) => {
	if (error instanceof HttpError && error.status === 404) {
		return 404;
	}
	if (error instanceof DOMException && error.name === "TimeoutError") {
		return 504;
	}

	return 502;
};

const messageOf = (error: unknown) =>
	error instanceof Error ? error.message : String(error);

export const buildServer = ({ upstream, log = console.log }: Options) => {
	const app = Fastify();
	const loadProfile = createProfile(upstream);

	// One controller for each response that is still being built. Aborting it stops the upstream
	// requests of that response.
	const inFlight = new Set<AbortController>();
	let stopping = false;

	app.get("/health", async () => ({ inFlight: inFlight.size }));

	app.get<{ Params: { name: string } }>(
		"/pokemon/:name",
		async (request, reply) => {
			const controller = new AbortController();
			inFlight.add(controller);

			// close on the raw response — the connection ended. If the answer was not finished,
			// the client left. (`request.raw` closes when the request is read, not when the client goes.)
			reply.raw.on("close", () => {
				inFlight.delete(controller);
				if (!reply.raw.writableFinished) {
					controller.abort();
					log("client left, upstream cancelled");
				}
			});

			try {
				// emit with { signal } — through signalPlugin: aborting the controller aborts every
				// upstream request of this call
				const call = loadProfile(request.params.name);
				return await bus.emit(call, { signal: controller.signal });
			} catch (error) {
				// nobody is left to answer when the client closed the connection
				if (reply.raw.destroyed) {
					return reply;
				}
				if (stopping) {
					// the connection must not stay open for the next request: the server is going away
					reply.header("connection", "close");
				}
				const status = stopping ? 503 : statusOf(error);

				return reply.code(status).send({ error: messageOf(error) });
			}
		},
	);

	// Abort what is in flight (each of those answers 503), then close the app: it stops listening
	// and waits for the connections. After 2 s the wait ends anyway.
	const shutdown = () => {
		stopping = true;
		for (const controller of inFlight) {
			controller.abort();
		}

		return new Promise<void>((resolve) => {
			const timer = setTimeout(resolve, 2000);
			timer.unref();
			app.close().then(resolve, resolve);
		});
	};

	return { app, shutdown };
};
