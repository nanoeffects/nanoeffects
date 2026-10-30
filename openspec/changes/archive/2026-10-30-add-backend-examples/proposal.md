# Proposal

## Why

Every example so far runs in a browser. On a server the same library solves other problems: the work a client started should stop when the client leaves, a background queue must retry and give up, and a service must stop without losing or half-doing the work in flight. There is no example that shows any of this, and a reader who builds a Node service has to guess how `AbortSignal`, `queue`, `retry` and the lifecycle of a module fit together. Nobody writes a bare `node:http` server any more, so the examples are Fastify apps, the shape a reader copies. Three small programs cover the three questions that matter most: cancelling work for a request, stopping a worker cleanly, and tying work to the life of a connection.

## What Changes

- **`examples/api-server`**: a Fastify backend for a front end over PokeAPI. `GET /pokemon/:name` answers one JSON object built from one request for the pokémon and one request per ability. The route runs a command `loadProfile(name)` that carries its handler: the pokémon under `timeout` and `retry` (an answer below 500 is not retried), then the abilities with `allSettled`, each under `timeout`, so a failed or slow ability is `text: null` and the answer is still 200. PokeAPI 404 is a 404, a timeout is a 504, anything else is a 502.
  - **The point.** The route aborts an `AbortController` when the client closes the connection before the answer (`reply.raw` emits `close` before the answer is finished), and passes its signal to `bus.emit(loadProfile(name), { signal })` through `signalPlugin`. The upstream requests get that signal, so a client that leaves stops the calls to PokeAPI.
  - `GET /health` answers with the number of requests in flight. On SIGTERM or SIGINT the server aborts the requests in flight, closes the Fastify app and exits.
- **`examples/job-worker`**: a Fastify app with an in-memory queue that sends emails through a fake mailer that misbehaves on a known schedule. The job `email/send` runs under `queue({ concurrency: 3 })`, `retry` with a growing pause and `timeout`. `POST /emails` answers 202 at once and queues the job, and `GET /stats` answers the counts, which come from the outcomes of the job.
  - **The point.** A graceful shutdown in three steps: stop taking new emails, wait for the ones in flight to finish for a limited time, then abort the rest so they end as cancelled.
- **`examples/ws-server`**: a Fastify app with `@fastify/websocket` that streams prices from a fake feed. The life of a socket is the life of its work: a client sends `{ "subscribe": "BTC" }`, a newer subscription of the same socket replaces the older (`latest`, keyed by socket), a socket that is silent for too long is closed (`race` of `take` and `delay`), and closing the socket aborts everything started for it.
  - **The point.** A connection lasts minutes and carries several tasks, so one `AbortController` for each socket is the owner of them all. The shutdown closes every socket with code 1001 and aborts what is running.
- The three examples use Fastify, the library, TypeScript run with `tsx`, and no database. Each has a README, and a row in `examples/README.md`. `CHANGELOG.md` under `Unreleased`.
- **Tests.** The examples have no browser, so they are tested: `src/tests/backend-examples.test.ts` runs them against fakes with `app.inject` and `app.injectWS`, for the status mapping, the retries and timeouts, the disconnect, the concurrency limit, the counters, the subscriptions and the shutdown.

Out of scope: a webhook receiver and a poller service (possible later), NestJS (its decorators do not pass the test toolchain; a recipe in `docs/` could cover it), Hono or Express, a database or Redis, tracing with `traceGroupId`, a docs page, and any change in `src/` of the library.

## Capabilities

### New Capabilities
- `api-server-example`: the backend for a front end that cancels upstream work when the client leaves.
- `job-worker-example`: the queue worker with counted outcomes and a graceful shutdown.
- `ws-server-example`: the WebSocket server whose work lives and dies with each socket.

### Modified Capabilities

## Impact

- New folders `examples/api-server/`, `examples/job-worker/` and `examples/ws-server/` (not published), each with its own `package.json` (`fastify` and `tsx`, as the other examples have their own), `tsconfig.json`, README and sources; type-checked by `pnpm tsgo` and linted by `pnpm check`.
- New `src/tests/backend-examples.test.ts` in the repository. `vitest.config.ts` maps `nanoeffects/*` to the sources (it gets the `signal` entry).
- The root `package.json` gets `fastify`, `@fastify/websocket` and `@types/ws` as dev dependencies, so that `pnpm tsgo` and the tests see their types. The published package and its size limits do not change.
- `examples/README.md`, `CHANGELOG.md`. The library and its size limits do not change.
