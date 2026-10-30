# ws-server-example Specification

## Purpose
Show a Fastify WebSocket server whose work lives and dies with each socket: one controller for each connection, a keyed subscription, an idle close and a clean shutdown.

## Requirements

### Requirement: The ws-server example streams prices over a WebSocket
`examples/ws-server/` SHALL be a TypeScript project that starts with `npm start`, is a Fastify app with `@fastify/websocket`, and uses a fake price feed with no network. A client SHALL connect to `/prices` and send `{ "subscribe": "<symbol>" }`; the server SHALL then send `{ symbol, price, time }` for every tick of the feed, and `{ error }` for a message it does not understand, without closing the socket.

#### Scenario: Subscribe
- **WHEN** a client sends `{ "subscribe": "BTC" }`
- **THEN** it receives prices for `BTC` at the rate of the feed

#### Scenario: A message that is not understood
- **WHEN** a client sends text that is not a subscription
- **THEN** it receives an `error` message and the socket stays open

### Requirement: A new subscription replaces the old one of the same socket only
The subscription SHALL be a command under `latest` that is keyed by the socket. A new subscription of a socket SHALL stop the old one of that socket, and SHALL NOT stop the subscription of another socket.

#### Scenario: Replace
- **WHEN** a socket subscribes to `BTC` and then to `ETH`
- **THEN** it receives no more `BTC` prices after the second subscription takes effect

#### Scenario: Two sockets
- **WHEN** two sockets subscribe and one subscribes again
- **THEN** the other keeps receiving its prices

### Requirement: Closing the socket stops its work
The server SHALL abort an `AbortController` when the socket closes, and SHALL pass its signal to every `bus.emit` made for that socket through `signalPlugin`, so the subscription and the idle guard of that socket stop and the feed is not polled for it any more.

#### Scenario: The client leaves
- **WHEN** a client closes the socket
- **THEN** the feed is not polled for that socket after that, and the idle guard ends

### Requirement: A silent socket is closed
A guard command SHALL wait with `race` for either a message of its socket (`take` with a predicate) or `idleMs` (`delay`). When the time passes first, the server SHALL close the socket with code 1001; when a message comes first, the wait SHALL start again.

#### Scenario: Idle
- **WHEN** a socket sends nothing for `idleMs`
- **THEN** the server closes it with code 1001

#### Scenario: Activity
- **WHEN** a socket sends a message before `idleMs` has passed
- **THEN** the socket stays open for another `idleMs`

### Requirement: The server stops cleanly
On SIGTERM or SIGINT the server SHALL abort every socket's work, close every socket with code 1001, close the app, and exit with code 0.

#### Scenario: Shutdown
- **WHEN** the process receives SIGTERM while sockets are open
- **THEN** every client sees the close with code 1001 and the process exits with 0

### Requirement: The example is tested and passes the project gates
`src/tests/backend-examples.test.ts` SHALL run the app with a fake feed and `app.injectWS`, and cover the subscription, the replacement, two sockets, the close, the idle close and the shutdown. `examples/ws-server/` SHALL pass `pnpm tsgo` and `pnpm check`, SHALL NOT be part of the published package, SHALL NOT change anything in `src/` of the library, and SHALL add no dependency to the published package.

#### Scenario: Gates
- **WHEN** `pnpm verify` runs
- **THEN** it passes with the example and its tests in the repository
