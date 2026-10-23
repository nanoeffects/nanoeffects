import { useEffect, useState, useSyncExternalStore } from "react";
import { bus, getRequestLog, getTraceLines, subscribe } from "./bus";
import type { Item } from "./fake-api";

export function App() {
	const [query, setQuery] = useState("");
	const [items, setItems] = useState<Item[]>([]);
	const requests = useSyncExternalStore(subscribe, getRequestLog);
	const traces = useSyncExternalStore(subscribe, getTraceLines);

	// bus.on returns the function that removes the listener; returning it from the effect
	// unsubscribes when the component unmounts
	useEffect(() => bus.on("results", setItems), []);

	function handleChange(value: string) {
		setQuery(value);
		bus.emit("typed", value); // bus.emit — starts the debounced, latest-only search
	}

	return (
		<>
			<h1>Search in React with debounce and latest</h1>
			<p>
				Type fast: only one request starts, after 300 ms of quiet. Type again
				while a request is running (each takes 800 ms): the older one is
				aborted. Every task is traced: see it in the list below, in the browser
				console, and in Redux DevTools (open the preview in its own tab for the
				extension).
			</p>
			<input
				value={query}
				placeholder="Type a query"
				autoComplete="off"
				onChange={(event) => handleChange(event.target.value)}
			/>
			<h2>Requests</h2>
			<ul>
				{requests.map((request, index) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: the log only grows at the top and is never reordered
					<li key={index} className={request.status}>
						"{request.query}": {request.status}
					</li>
				))}
			</ul>
			<h2>Last result</h2>
			<p>
				{items.length > 0
					? items.map((item) => item.title).join(", ")
					: "nothing yet"}
			</p>
			<h2>Trace</h2>
			<ul className="trace">
				{traces.map((line) => (
					<li key={line.id} className={line.phase}>
						{line.label}: {line.phase}
					</li>
				))}
			</ul>
		</>
	);
}
