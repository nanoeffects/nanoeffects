import { useState } from "react";
import { app } from "../app";
import { incomingModule } from "../domains/incoming/incoming-module";

export function IncomingToggle() {
	const [running, setRunning] = useState(true);

	function toggle() {
		if (running) {
			// unmount — the module's background task is aborted, so no more messages arrive
			app.unmount(incomingModule);
		} else {
			app.mount(incomingModule);
		}
		setRunning(!running);
	}

	return (
		<button type="button" onClick={toggle}>
			{running ? "Stop incoming messages" : "Start incoming messages"}
		</button>
	);
}
