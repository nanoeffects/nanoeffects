import { type FormEvent, useState } from "react";
import { useStore } from "zustand";
import { sendMessage } from "../entities/message/message";
import { roomStore } from "../entities/room/room-store";
import { bus } from "../shared/bus";

export function Composer() {
	const [text, setText] = useState("");
	// useStore — read a Zustand store; the component renders again when the store changes
	const { selected } = useStore(roomStore);

	function handleSubmit(event: FormEvent) {
		event.preventDefault();
		if (!selected || text.trim() === "") {
			return;
		}
		// bus.emit — start the send job; the message entity shows the message and its outcome
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
