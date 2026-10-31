import { bus } from "./bus";
import { type Line, messageAdded, messageSent, typingChanged } from "./chat";
import { history } from "./history";

// Draws the panel and keeps it in step with the bus. It does not talk to the bot: it only
// sends the texts and shows the lines. Returns the one call that removes the panel.
export const renderPanel = (parent: HTMLElement): (() => void) => {
	const panel = document.createElement("section");
	panel.className = "chat";
	panel.innerHTML = `
		<div class="lines"></div>
		<p class="typing" hidden>The bot is typing…</p>
		<form><input name="text" autocomplete="off" placeholder="Write to the bot" /><button>Send</button></form>
	`;
	parent.append(panel);

	const lines = panel.querySelector<HTMLDivElement>(".lines");
	const typing = panel.querySelector<HTMLParagraphElement>(".typing");
	const form = panel.querySelector<HTMLFormElement>("form");
	const input = panel.querySelector<HTMLInputElement>("input");
	if (!(lines && typing && form && input)) {
		throw new Error("the panel markup is broken");
	}

	const showLine = (line: Line) => {
		const row = document.createElement("p");
		row.className = line.from;
		row.textContent = `${line.from}: ${line.text}`;
		lines.append(row);
		lines.scrollTop = lines.scrollHeight;
	};
	const showTyping = (isTyping: boolean) => {
		typing.hidden = !isTyping;
	};
	const send = (event: SubmitEvent) => {
		event.preventDefault();
		const text = input.value.trim();
		form.reset();
		if (text) {
			bus.emit(messageSent(text)); // the module hears it and asks the bot
		}
	};

	history.forEach(showLine); // a reopened chat shows the old lines
	form.addEventListener("submit", send);

	// on returns the function that unsubscribes
	const unbindLine = bus.on(messageAdded, showLine);
	const unbindTyping = bus.on(typingChanged, showTyping);
	input.focus();

	return () => {
		unbindLine();
		unbindTyping();
		panel.remove(); // the form listener goes with the element
	};
};
