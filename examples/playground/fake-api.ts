// A stand-in for a real server: answers after a delay and honors the AbortSignal, as fetch does.
export type Item = { id: number; title: string };

export type RequestEvent = {
	query: string;
	status: "started" | "aborted" | "done";
};

export const createFakeApi = (
	report: (event: RequestEvent) => void,
	latency = 800,
) => ({
	search(query: string, { signal }: { signal: AbortSignal }) {
		return new Promise<Item[]>((resolve, reject) => {
			report({ query, status: "started" });
			const timer = setTimeout(() => {
				report({ query, status: "done" });
				resolve([
					{ id: 1, title: `${query} (first)` },
					{ id: 2, title: `${query} (second)` },
				]);
			}, latency);
			signal.addEventListener("abort", () => {
				clearTimeout(timer);
				report({ query, status: "aborted" });
				reject(signal.reason);
			});
		});
	},
});
