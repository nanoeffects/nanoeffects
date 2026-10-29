// `npm run dev`: starts the chat server and the Vite dev server in one process.
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { startServer } from "./server.js";

await startServer(3001);

// vite.config.ts forwards /api to the server above
const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ root });
await vite.listen();
vite.printUrls();
