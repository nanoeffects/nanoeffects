import { useEffect, useRef, useState } from "react";
import { createSession, SECONDS } from "./session";

type Session = ReturnType<typeof createSession>;

export function App() {
	const [run, setRun] = useState(1); // the number of the session; Restart makes the next one
	const [left, setLeft] = useState(SECONDS);
	const [outcome, setOutcome] = useState<"claimed" | "expired" | null>(null);
	const [log, setLog] = useState<string[]>([]); // proof that old sessions are gone
	const session = useRef<Session>(null);

	useEffect(() => {
		setLeft(SECONDS);
		setOutcome(null);

		const current = createSession(); // a fresh bus for this run
		session.current = current;
		current.bus.on("tick", setLeft);
		current.bus.on("finished", setOutcome);
		current.bus.emit("start");

		// cleanup: runs on Restart; dispose removes every listener and stops the timer, then we check it
		return () => {
			current.dispose().then(() => {
				const { listeners, timerRunning } = current.inspect();
				const timer = timerRunning ? "STILL RUNNING" : "stopped";
				setLog((lines) => [
					`Session #${run} disposed: timer ${timer}, listeners left: ${listeners}`,
					...lines,
				]);
			});
		};
	}, [run]);

	const { listeners, timerRunning } = session.current?.inspect() ?? {
		listeners: 0,
		timerRunning: false,
	};

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

			<h2>What is alive</h2>
			<p className="state">
				Session #{run}: timer {timerRunning ? "running" : "stopped"}, listeners:{" "}
				{listeners}
			</p>
			<ul className="log">
				{log.map((line) => (
					<li key={line}>✓ {line}</li>
				))}
			</ul>
		</>
	);
}
