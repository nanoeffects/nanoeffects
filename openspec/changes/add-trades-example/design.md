# Design

## Context

A task has `ctx.signal`, `ctx.emit` and runs until its promise settles. A socket fits: the handler returns a promise that settles when the socket closes, so `retry` can open it again and an abort can close it. See proposal.md for why a WebSocket example.

## Goals / Non-Goals

**Goals:**
- Show a stream as a task: open, emit, close on abort, reopen on drop.
- Keep the stream and the screen apart: the bus gets everything, the screen takes what it can draw.

**Non-Goals:**
- A reusable WebSocket helper in the library. If the example turns out to be long, the answer is a docs recipe, not a new entry.
- Several streams, subscribe messages, order books.

## Decisions

- **Source.** Binance trade stream, `wss://stream.binance.com:9443/ws/<symbol>@trade`: no key, no subscribe message, JSON messages with price (`p`), quantity (`q`), time (`T`) and `m` (the buyer is the maker). Checked from Node 22 on 2026-10-30: messages arrive. The pair list in the select is a short fixed list of liquid pairs, so the stream is busy.
- **One command.** `watchTrades = createCommand("trades/watch", latest(retry(listen, { times: Infinity, delay, shouldRetry })))`. `listen(symbol, ctx)` opens the socket and returns a promise that rejects when the socket closes or errors and never resolves; an abort closes the socket and rejects with the abort reason, which `retry` does not repeat. `latest` aborts the connection of the previous pair. The exact `delay` form (a function of the attempt for a growing pause) and whether `times: Infinity` is allowed are checked against `retry` at implementation; if `retry` does not allow it, the design is updated, not the library.
- **Events.** `tradeReceived` (payload: a trade) and `statusChanged` (`connecting`, `live`, `reconnecting`), actions in `trades.ts`; the handler emits them with `ctx.emit`. The status is `reconnecting` from a drop until the first message.
- **The screen.** `useEventState(tradeReceived, ...)` re-renders on every message, which is the problem to show. The component keeps the last N trades in a ref filled by `bus.on` and shows them through a throttled state: `throttle` from `nanoeffects/policies` as a plain function (`withPolicy`). The decision between `withPolicy(throttle(...))` and a throttled handler is made at implementation by what reads best; the README states what was chosen and why.
- **Files.** `bus.ts`, `trades.ts` (actions, the command, `listen`), `App.tsx`, `main.tsx`, `index.html`, `package.json`, `tsconfig.json`, `README.md`.
- **Docs.** The README of the example explains the pattern. A docs page is added only if the pattern is general enough to be a recipe; the choice is made after the example works, and then `llms.txt` gets the link.

## Risks / Trade-offs

- [Binance is blocked in some regions, for example the US] → the README says so and names the Coinbase and Kraken feeds of the same list as replacements (they need a subscribe message).
- [The stream is quiet for a pair] → the fixed list holds busy pairs; the status shows live even with no trade yet.
- [`retry` with no limit may not fit its types] → see the command decision above.

## Open Questions

- Decided: no docs page; the README of the example carries the pattern.
