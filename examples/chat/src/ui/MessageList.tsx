import { useStore } from "zustand";
import { messagesStore } from "../domains/messages/messages-store";

export function MessageList() {
	const { loading, messages, marked } = useStore(messagesStore);

	if (loading) {
		return <p>Loading the history…</p>;
	}

	return (
		<ul className="messages">
			{messages.map((message) => (
				<li
					key={message.id}
					className={`${message.state} ${message.id === marked ? "marked" : ""}`}
				>
					<b>{message.author}</b>: {message.text}
					{message.state === "sending" && " (sending…)"}
					{message.state === "failed" && " (failed)"}
				</li>
			))}
		</ul>
	);
}
