import { buildServer } from "./server";

const port = Number(process.env.PORT ?? 3000);
const { app, shutdown } = buildServer();

await app.listen({ port });
console.log(`ws-server: ws://localhost:${port}/prices`);

// SIGTERM is what a container sends, SIGINT is Ctrl+C
for (const name of ["SIGTERM", "SIGINT"] as const) {
	process.on(name, async () => {
		console.log(`${name}: closing the sockets`);
		await shutdown();
		process.exit(0);
	});
}
