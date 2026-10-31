import { app, bus } from "./bus";
import { closeRequested } from "./chat";
import { chatModule } from "./chat-module";
import { renderPanel } from "./panel";

const button = document.querySelector<HTMLButtonElement>("#chat-launcher");
const status = document.querySelector<HTMLParagraphElement>("#status");

let close: (() => void) | null = null; // set while the chat is open

const show = (text: string) => {
	if (status) {
		status.textContent = text;
	}
};

const open = () => {
	// mount — the subscriptions, the polling and the Escape listener of the module start
	const stopModule = app.mount(chatModule);
	const stopPanel = renderPanel(document.body);
	close = () => {
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

// the launcher stays subscribed: it must hear Escape to close the chat
bus.on(closeRequested, () => close?.());
