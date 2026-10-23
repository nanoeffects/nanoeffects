// A stand-in for a real server: answers after a delay and honors the AbortSignal, as fetch does.
export type Item = { id: number; title: string };

export const api = {
	search(query: string, { signal }: { signal: AbortSignal }) {
		return new Promise<Item[]>((resolve, reject) => {
			const timer = setTimeout(() => {
				resolve([
					{ id: 1, title: `${query} (first)` },
					{ id: 2, title: `${query} (second)` },
				]);
			}, 800);
			signal.addEventListener("abort", () => {
				clearTimeout(timer);
				reject(signal.reason);
			});
		});
	},
};
