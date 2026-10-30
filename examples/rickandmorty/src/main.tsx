import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { App } from "./App";

// The retries are the job of nanoeffects (see characters.ts), so React Query does not repeat a query
const queryClient = new QueryClient({
	defaultOptions: { queries: { retry: false } },
});
const root = document.querySelector("#root");

if (root) {
	createRoot(root).render(
		<QueryClientProvider client={queryClient}>
			<App />
		</QueryClientProvider>,
	);
}
