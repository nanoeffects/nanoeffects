import { type FormEvent, useState } from "react";
import { useStore } from "zustand";
import { bus } from "../bus";
import { sendMessage } from "../domains/messages/messages";
import { roomsStore } from "../domains/rooms/rooms-store";

export function Composer() {
	const [text, setText] = useState("");
	// useStore — read a Zustand store; the component renders again when the store changes
	const { selected } = useStore(roomsStore);

	function handleSubmit(event: FormEvent) {
		event.preventDefault();
		if (!selected || text.trim() === "") {
			return;
		}
		// bus.emit — start the send job; the messages domain shows the message and its outcome
		// the local id names this message until the server answers
		const localId = crypto.randomUUID();
		bus.emit(sendMessage({ localId, roomId: selected, text }));
		setText("");
	}

	return (
		<form className="composer" onSubmit={handleSubmit}>
			<input
				value={text}
				placeholder="Write a message (/fail is rejected)"
				autoComplete="off"
				onChange={(event) => setText(event.target.value)}
			/>
		</form>
	);
}
