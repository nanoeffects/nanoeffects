// The view of both pages: it knows neither the bus nor Redux, only what to show and what to call.
type CounterProps = {
	count: number;
	error: string;
	onIncrement: () => void;
	onIncrementLater: () => void;
	onCancel: () => void;
	onIncrementFlaky: () => void;
	onIncrementBroken: () => void;
};

export function Counter(props: CounterProps) {
	return (
		<>
			<h1>A counter</h1>
			<p className="hint">
				"+1 after 1 s" waits a second; click it twice and only the second
				counts. "Cancel" stops the one that waits. The server buttons try three
				times.
			</p>
			<p className="count">{props.count}</p>
			<button type="button" onClick={props.onIncrement}>
				+1
			</button>
			<button type="button" onClick={props.onIncrementLater}>
				+1 after 1 s
			</button>
			<button type="button" onClick={props.onCancel}>
				Cancel
			</button>
			<button type="button" onClick={props.onIncrementFlaky}>
				+1 from a flaky server
			</button>
			<button type="button" onClick={props.onIncrementBroken}>
				Always fails
			</button>
			{props.error && <p className="failed">{props.error}</p>}
		</>
	);
}
