import { app, bus } from "./bus";
import {
	closeRequested,
	messageAdded,
	messageSent,
	typingChanged,
} from "./chat";
import { chatModule } from "./chat-module";
import { renderPanel } from "./panel";

const button = document.querySelector<HTMLButtonElement>("#chat-launcher");
const status = document.querySelector<HTMLParagraphElement>("#status");
const listeners = document.querySelector<HTMLPreElement>("#listeners");

let close: (() => void) | null = null; // set while the chat is open

const watched = [messageSent, messageAdded, typingChanged, closeRequested];

// bus.get gives the listeners of an event: the length says whether anything is left
const showListeners = () => {
	const lines = watched.map((event) => {
		const count = bus.get(event.type).length;
		return `${event.type.padEnd(22)} ${count}`;
	});
	// get() with no name gives every listener of every event
	lines.push(`${"all events".padEnd(22)} ${bus.get().length}`);
	if (listeners) {
		listeners.textContent = lines.join("\n");
	}
};

const show = (text: string) => {
	if (status) {
		status.textContent = text;
	}
	showListeners();
};

const open = () => {
	// mount — the subscriptions, the polling and the Escape listener of the module start
	const stopModule = app.mount(chatModule);
	const stopPanel = renderPanel(document.body);
	// the launcher listens for Escape only while the chat is open: nothing sends it otherwise
	const stopEscape = bus.on(closeRequested, () => close?.());
	close = () => {
		stopEscape();
		stopPanel();
		stopModule(); // everything the module started ends, a running request included
		close = null;
		show("The chat is closed: nothing is subscribed, nothing is polled.");
	};
	show(
		"The chat is open: the bot is subscribed, the operator is polled every 5 s.",
	);
};

button?.addEventListener("click", () => {
	if (close) {
		close();
	} else {
		open();
	}
});

show("The chat is closed: nothing is subscribed, nothing is polled.");
