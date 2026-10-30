import { createMailer } from "./mailer";
import { buildServer } from "./server";
import { createWorker } from "./worker";

const port = Number(process.env.PORT ?? 3000);
const drainMs = Number(process.env.DRAIN_MS ?? 5000);

const worker = createWorker({ mailer: createMailer(), drainMs });
const app = buildServer({ worker });

await app.listen({ port });
console.log(`job-worker: POST http://localhost:${port}/emails`);

// SIGTERM is what a container sends, SIGINT is Ctrl+C
for (const name of ["SIGTERM", "SIGINT"] as const) {
	process.on(name, async () => {
		console.log(`${name}: shutting down`);
		const counts = await worker.shutdown();
		console.log("done:", counts);
		await app.close();
		process.exit(0);
	});
}
