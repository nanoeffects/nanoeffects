import { defineConfig } from "vite";

// the page asks /api/..., and Vite forwards it to the chat server (server/dev.js starts both)
export default defineConfig({
	server: { proxy: { "/api": "http://localhost:3001" } },
});
