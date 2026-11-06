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

		// dispose the session and write down what is left; it runs once
		let ended = false;
		const end = async () => {
			if (ended) {
				return;
			}
			ended = true;
			await current.dispose();
			const { listeners, timerRunning } = current.inspect();
			const timer = timerRunning ? "STILL RUNNING" : "stopped";
			setLog((lines) => [
				`Session #${run} disposed: timer ${timer}, listeners left: ${listeners}`,
				...lines,
			]);
		};

		current.bus.on("tick", setLeft);
		current.bus.on("finished", (result) => {
			setOutcome(result);
			end(); // the discount is taken or gone: the session is over, dispose it
		});
		current.bus.emit("start");

		// cleanup: runs on Restart; a session that is still running is disposed here
		return () => {
			end();
		};
	}, [run]);

	const { listeners, listenersOf, timerRunning } =
		session.current?.inspect() ?? {
			listeners: 0,
			listenersOf: [],
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
			<ul className="listeners">
				{listenersOf.map(({ name, count }) => (
					<li key={name}>
						{name}: {count}
					</li>
				))}
			</ul>
			<ul className="log">
				{log.map((line) => (
					<li key={line}>✓ {line}</li>
				))}
			</ul>
		</>
	);
}
