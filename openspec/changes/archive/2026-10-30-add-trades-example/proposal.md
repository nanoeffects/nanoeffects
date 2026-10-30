# Proposal

## Why

Every example so far is request and response. A WebSocket is the other common shape of async code: a connection that lives for a long time, sends events nobody asked for, drops, and must be opened again. The docs have no page for it, and a reader cannot see how the policies, `retry` and the abort of a task fit a long-lived stream. The list [public-streaming-api](https://github.com/conduktor/public-streaming-api) names free WebSocket sources that need no key; the Binance trade stream (`wss://stream.binance.com:9443/ws/<symbol>@trade`) is the simplest: no subscribe message, CORS does not apply to sockets, and the rate is high enough to need a limit.

## What Changes

- A new example project, `examples/trades/`: React and TypeScript, a live list of trades of one trading pair from the Binance stream, with a pair selector and a connection status.
- One command that carries its handler, `watchTrades(symbol)`: it opens the socket, emits a `tradeReceived` action for every message with `ctx.emit`, closes the socket when the task is aborted (`ctx.signal`), and opens it again after a drop with a growing pause (`retry` with a `delay` function and no limit of attempts). `latest` makes a new pair abort the old connection.
- The screen reads the stream with `useEventState` and `throttle`: the bus gets every trade, the list is rebuilt at most a few times a second. The status (connecting, live, reconnecting) comes from an action the handler emits.
- `examples/trades/README.md`, a row in `examples/README.md`, a line in `CHANGELOG.md`. If the example shows a pattern a reader needs, a short section in `docs/` (decided in the design) linked from `llms.txt`.

Out of scope: any change in `src/` (no WebSocket helper in the library; the example shows that none is needed), other exchanges, an order book, authentication, and tests that call the network.

## Capabilities

### New Capabilities
- `trades-example`: the live trades example over a WebSocket.

### Modified Capabilities

## Impact

- New folder `examples/trades/` (not published), type-checked by `pnpm tsgo` and linted by `pnpm check`. It depends on the published `nanoeffects ^0.20.0` and on the network only when it runs.
- `examples/README.md`, `CHANGELOG.md`, and possibly one docs page. No change to `src/`, the package or the size limits.
