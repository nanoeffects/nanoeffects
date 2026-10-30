import { Composer } from "./Composer";
import { IncomingToggle } from "./IncomingToggle";
import { MessageList } from "./MessageList";
import { RoomList } from "./RoomList";
import { RoomsProvider } from "./RoomsProvider";
import { SearchBox } from "./SearchBox";

export function App() {
	return (
		<RoomsProvider>
			<h1>A chat with entities, features and modules</h1>
			<p className="hint">
				The components only emit events and read values. The work lives in
				src/entities (room, message) and src/features (show-history,
				receive-messages, search-messages). The data comes from a small server
				(server/server.js) that fails on a known schedule.
			</p>
			<SearchBox />
			<div className="layout">
				<RoomList />
				<section>
					<MessageList />
					<Composer />
					<IncomingToggle />
				</section>
			</div>
		</RoomsProvider>
	);
}
