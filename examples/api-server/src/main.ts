import { buildServer } from "./server";
import { createUpstream } from "./upstream";

const port = Number(process.env.PORT ?? 3000);
const { app, shutdown } = buildServer({ upstream: createUpstream() });

await app.listen({ port });
console.log(`api-server: http://localhost:${port}/pokemon/pikachu`);

// SIGTERM is what a container sends, SIGINT is Ctrl+C
for (const name of ["SIGTERM", "SIGINT"] as const) {
	process.on(name, async () => {
		console.log(`${name}: stopping, aborting requests in flight`);
		await shutdown();
		process.exit(0);
	});
}
