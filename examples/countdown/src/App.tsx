import { useEffect, useRef, useState } from "react";
import { createSession, SECONDS } from "./session";

export function App() {
	const [run, setRun] = useState(0); // every Restart makes a new number, so a new session
	const [left, setLeft] = useState(SECONDS);
	const [outcome, setOutcome] = useState<"claimed" | "expired" | null>(null);
	const session = useRef<ReturnType<typeof createSession>>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: run is the trigger, a new number restarts the session
	useEffect(() => {
		setLeft(SECONDS);
		setOutcome(null);

		const { bus, dispose } = createSession(); // a fresh bus for this run
		session.current = { bus, dispose };
		const offTick = bus.on("tick", setLeft);
		const offFinished = bus.on("finished", setOutcome);
		bus.emit("start");

		// cleanup: runs on Restart and on unmount; the old session stops and hears nothing
		return () => {
			offTick();
			offFinished();
			dispose();
		};
	}, [run]);

	return (
		<>
			<h1>Get 20% off</h1>
			{outcome === null && <div className="timer">{left} s</div>}
			{outcome === "claimed" && <p>🎉 Discount taken!</p>}
			{outcome === "expired" && <p>⏰ Too late, the offer is gone.</p>}
			<button
				type="button"
				disabled={outcome !== null}
				onClick={() => session.current?.bus.emit("claim")}
			>
				Take the discount
			</button>
			<button type="button" onClick={() => setRun(run + 1)}>
				Restart
			</button>
		</>
	);
}
