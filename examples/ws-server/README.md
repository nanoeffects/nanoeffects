# WebSocket server example

A [Fastify](https://fastify.dev) server with `@fastify/websocket` that streams prices from a fake
feed. It shows what a long connection needs: **the life of a socket is the life of its work.** One
socket carries several tasks for minutes, and when it closes, they all stop.

You need Node 18 or newer. No database, no network.

```bash
npm install
npm start
```

Connect with any WebSocket client. In Node 22 or newer, that is the built-in `WebSocket`:

```js
const socket = new WebSocket("ws://localhost:3000/prices");
socket.onmessage = (event) => console.log(event.data);
socket.onopen = () => socket.send(JSON.stringify({ subscribe: "BTC" }));
```

| What you do | What happens | Wrappers |
| ----------- | ------------ | -------- |
| Send `{ "subscribe": "BTC" }` | A price arrives now and then every second (the `tickMs` option of `buildServer`) | `poll` |
| Subscribe to `ETH` on the same socket | `BTC` stops, `ETH` starts | `latest` with a `key` |
| Subscribe on a second socket | The first socket keeps its symbol | `latest` with a `key` |
| Send text that is not a subscription | You get `{ "error": ... }` and the socket stays open | |
| Send nothing for 30 s | The server closes the socket with code 1001 | `race`, `take`, `delay` |
| Close the tab | The server stops the subscription and the idle wait for that socket | `signalPlugin` |
| Press Ctrl+C | Every socket is closed with code 1001, the work is aborted, the process exits with 0 | `signalPlugin` |

## One controller for each socket

When a socket connects, the server makes an `AbortController` for it. Every `bus.emit` made for
that socket gets its signal, through `signalPlugin`. When the socket closes, the controller aborts,
and that stops everything started for the socket: the subscription, the idle wait, and what they
started.

A policy by itself would mix the sockets up: `latest` keeps one call alive for a whole command, so
a subscription on socket A would stop the one on socket B. The `key` option fixes it: `latest(fn,
{ key: (call) => call.socketId })` keeps one running call for each socket.

## The idle wait

`guardIdle` is a command with a loop. Each round it waits for the first of two things: a message
of its socket (`take` with a `predicate`) or the end of the time (`delay`). The `race` gives each
starter its own `child`, so the one that loses is stopped. If the time wins, the server closes the
socket; if a message wins, the wait starts again.

The files, each with one job:

- `src/bus.ts` — the bus, with `signalPlugin`.
- `src/feed.ts` — the fake feed: a fixed walk, so a test knows every price.
- `src/prices.ts` and `src/prices-handlers.ts` — the commands `watchSymbol` and `guardIdle`, and the event `heard`.
- `src/server.ts` — `buildServer`: the route `/prices`, a controller for each socket, and the shutdown.
- `src/main.ts` — listens on `PORT` (default 3000) and stops on SIGTERM and SIGINT.

The tests of this example are in `src/tests/backend-examples.test.ts` of the repository; they use
`injectWS` of `@fastify/websocket`. The files in this folder are not part of the published package.
