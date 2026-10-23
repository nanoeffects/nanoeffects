import { useEffect, useState } from "react";
import { bus } from "./bus";
import type { Item } from "./fake-api";

export function App() {
	const [items, setItems] = useState<Item[]>([]);

	// bus.on returns the function that removes the listener; returning it unsubscribes on unmount
	useEffect(() => bus.on("results", setItems), []);

	return (
		<>
			<h1>Search in React with debounce and latest</h1>
			<p>
				Type fast: only one request starts, after 300 ms of quiet. Type again
				while a request runs (each takes 800 ms): the older one is aborted. Open
				the browser console to see every task.
			</p>
			<input
				placeholder="Type a query"
				autoComplete="off"
				onChange={(event) => bus.emit("typed", event.target.value)} // bus.emit — starts the search
			/>
			<ul>
				{items.map((item) => (
					<li key={item.id}>{item.title}</li>
				))}
			</ul>
		</>
	);
}
