import { throttle } from "nanoeffects/policies";
import { useEffect, useRef, useState } from "react";
import { bus, useEventState } from "./bus";
import {
	statusChanged,
	type Trade,
	tradeReceived,
	watchTrades,
} from "./trades";

const pairs = ["btcusdt", "ethusdt", "solusdt", "bnbusdt"];
const shown = 15;

export function App() {
	const [symbol, setSymbol] = useState(pairs[0] ?? "btcusdt");
	const [status] = useEventState(statusChanged, "connecting");
	const [trades, setTrades] = useState<Trade[]>([]);
	const latestTrades = useRef<Trade[]>([]);

	useEffect(() => {
		latestTrades.current = [];
		setTrades([]);
		const controller = new AbortController();
		// watchTrades — opens the stream; aborting the signal on cleanup closes the socket
		const connection = bus.emit(watchTrades(symbol), {
			signal: controller.signal,
		});
		// the connection ends only by an abort, which rejects the call: that is not an error here
		connection?.catch(() => void 0);
		return () => controller.abort();
	}, [symbol]);

	useEffect(() => {
		// the bus gets every trade, so this listener keeps all of them
		const keep = bus.on(tradeReceived, (trade) => {
			latestTrades.current = [trade, ...latestTrades.current].slice(0, shown);
		});
		// throttle — the list is drawn at most 4 times a second, whatever the rate of the stream
		const draw = bus.on(
			tradeReceived,
			throttle(250, () => setTrades(latestTrades.current)),
		);

		return () => {
			keep();
			draw();
		};
	}, []);

	return (
		<>
			<h1>Trades</h1>
			<select
				value={symbol}
				onChange={(event) => setSymbol(event.target.value)}
			>
				{pairs.map((pair) => (
					<option key={pair}>{pair}</option>
				))}
			</select>{" "}
			<span className="hint">{status}</span>
			<table>
				<tbody>
					{trades.map((trade) => (
						<tr key={trade.id}>
							<td>{new Date(trade.time).toLocaleTimeString()}</td>
							<td>{trade.price}</td>
							<td>{trade.quantity}</td>
						</tr>
					))}
				</tbody>
			</table>
		</>
	);
}
