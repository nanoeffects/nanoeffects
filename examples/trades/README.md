# Trades example

A live list of trades over a WebSocket: the public trade stream of Binance, with no key and no
server of your own. The connection is one task: it ends on an abort, starts again after a drop,
and feeds the screen through the bus.

```bash
npm install
npm run dev
```

Binance is not available in some regions, for example the US. The same list of free streams,
[public-streaming-api](https://github.com/conduktor/public-streaming-api), has Coinbase and Kraken;
they want a subscribe message sent in `onopen`, the rest of the example stays the same.

All the logic is in `src/trades.ts`: one command that carries its handler.

```ts
export const watchTrades = createCommand(
  "trades/watch",
  latest(retry(listen, { times: Number.POSITIVE_INFINITY, delay: pause })),
);
```

`listen` opens the socket and emits an action for every message with `ctx.emit`. It never resolves:
a closed socket is a failure for `retry` to repeat, and an abort closes the socket and rejects with
the abort reason, which `retry` does not repeat.

| What you do | What happens | Who does it |
| ----------- | ------------ | ----------- |
| Pick another pair | The old socket is closed (Network panel, WS tab) and a new one is opened | `latest` aborts the old task |
| Close the tab or unmount `App` | The socket is closed | the signal given to `bus.emit` |
| Switch the network off and on | The status shows `reconnecting`, then `connecting` and `live`; the pause grows from 0.5 s to 10 s | `retry` with a `delay` function |
| A busy pair | The bus gets every trade; the list is drawn 4 times a second at most | `throttle` on the listener |

`bus.emit(watchTrades(symbol), { signal })` rejects with the abort reason when the connection is
ended, so the component catches it: it is not an error there.
