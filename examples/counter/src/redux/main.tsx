import { useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { Counter } from "../Counter";
import "./handlers";
import {
	incrementBrokenRequested,
	incrementCancelled,
	incremented,
	incrementFlakyRequested,
	incrementLaterRequested,
} from "./slice";
import { store } from "./store";

// useSyncExternalStore — React's own way to read a store; react-redux does the same in useSelector
function App() {
	const { count, error } = useSyncExternalStore(
		store.subscribe,
		() => store.getState().counter,
	);

	return (
		<Counter
			count={count}
			error={error}
			onIncrement={() => store.dispatch(incremented())}
			onIncrementLater={() => store.dispatch(incrementLaterRequested())}
			onCancel={() => store.dispatch(incrementCancelled())}
			onIncrementFlaky={() => store.dispatch(incrementFlakyRequested())}
			onIncrementBroken={() => store.dispatch(incrementBrokenRequested())}
		/>
	);
}

const root = document.querySelector("#root");

if (root) {
	createRoot(root).render(<App />);
}
