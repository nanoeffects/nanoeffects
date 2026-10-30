import { useState } from "react";
import { app } from "../app";
import { receiveMessagesModule } from "../features/receive-messages/receive-messages-module";

export function IncomingToggle() {
	const [running, setRunning] = useState(true);

	function toggle() {
		if (running) {
			// unmount — the module's background task is aborted, so no more messages arrive
			app.unmount(receiveMessagesModule);
		} else {
			app.mount(receiveMessagesModule);
		}
		setRunning(!running);
	}

	return (
		<button type="button" onClick={toggle}>
			{running ? "Stop incoming messages" : "Start incoming messages"}
		</button>
	);
}
