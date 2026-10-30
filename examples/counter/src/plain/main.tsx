import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Counter } from "../Counter";
import { bus } from "./bus";
import {
	failed,
	incrementBrokenRequested,
	incrementCancelled,
	incremented,
	incrementFlakyRequested,
	incrementLaterRequested,
} from "./counter";
import "./handlers";

// The bus keeps no values, so the page keeps the count itself.
function App() {
	const [count, setCount] = useState(0);
	const [error, setError] = useState("");

	useEffect(() => {
		// bus.on returns the function that stops listening
		const stopIncremented = bus.on(incremented, () => {
			setCount((value) => value + 1);
			setError("");
		});
		const stopFailed = bus.on(failed, (message) => setError(message));

		return () => {
			stopIncremented();
			stopFailed();
		};
	}, []);

	return (
		<Counter
			count={count}
			error={error}
			onIncrement={() => bus.emit(incremented())}
			onIncrementLater={() => bus.emit(incrementLaterRequested())}
			onCancel={() => bus.emit(incrementCancelled())}
			onIncrementFlaky={() => bus.emit(incrementFlakyRequested())}
			onIncrementBroken={() => bus.emit(incrementBrokenRequested())}
		/>
	);
}

const root = document.querySelector("#root");

if (root) {
	createRoot(root).render(<App />);
}
