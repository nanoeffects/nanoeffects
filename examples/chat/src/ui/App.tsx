import { Composer } from "./Composer";
import { IncomingToggle } from "./IncomingToggle";
import { MessageList } from "./MessageList";
import { RoomList } from "./RoomList";
import { RoomsProvider } from "./RoomsProvider";
import { SearchBox } from "./SearchBox";

export function App() {
	return (
		<RoomsProvider>
			<h1>A chat with domains and modules</h1>
			<p className="hint">
				The components only emit events and read values. The work lives in
				src/domains: rooms, messages, search and incoming. The data comes from a
				small server (server/server.js) that fails on a known schedule.
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
