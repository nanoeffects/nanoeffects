# Tasks

## 0. Move to Fastify

- [x] 0.1 Add `fastify`, `@fastify/websocket` and `@types/ws` as dev dependencies of the root `package.json`. Verify with `pnpm tsgo`.
- [x] 0.2 Rewrite `src/server.ts` and `src/main.ts` of `examples/api-server` and `examples/job-worker` on Fastify (`reply.raw` for the disconnect, `app.close()` for the shutdown), change the `package.json` of both (`fastify`) and the tests of both to `app.inject` (a real port only for the disconnect). Verify with `pnpm tsgo`, `pnpm check` and `pnpm vitest run src/tests/backend-examples.test.ts`.

## 1. api-server

- [x] 1.1 Create `examples/api-server/` with `package.json` (`tsx`, scripts `start` and `dev`), `tsconfig.json`, `src/bus.ts`, `src/upstream.ts` (the PokeAPI client with `WithSignal` and a replaceable `fetch`) and `src/profile.ts` with `src/profile-handlers.ts` (`createProfile(upstream)`, the command `loadProfile`). Verify with `pnpm tsgo` and `pnpm check`.
- [x] 1.2 Write `src/server.ts` (`buildServer({ upstream })`, a Fastify app: the routes, the status mapping, the disconnect abort, `/health`, the set of controllers and `shutdown`) and `src/main.ts` (listen on `PORT`, wire SIGTERM and SIGINT). Verify with `pnpm tsgo` and `pnpm check`.
- [x] 1.3 Tests in `src/tests/backend-examples.test.ts` for api-server with a fake upstream: all abilities, one that fails, one over the limit (fake timers), a 404 without a retry, a failure that passes after two tries, a 504, the disconnect aborting the upstream signal, `/health`. Verify with `pnpm vitest run src/tests/backend-examples.test.ts`.
- [x] 1.4 Run it for real against PokeAPI: `curl` a pokémon, an unknown name, and press Ctrl+C with a request in flight; abort a `curl` and see the log line. Verify the same results as the spec.

## 2. job-worker

- [x] 2.1 Create `examples/job-worker/` with `package.json`, `tsconfig.json`, `src/mailer.ts` (the fake with its schedule, `/hang`, `/bad`, `MailError`), `src/jobs.ts` and `src/worker.ts` (`createWorker`: the module, the counts, `accept`, `shutdown`). Verify with `pnpm tsgo` and `pnpm check`.
- [x] 2.2 Write `src/server.ts` (`POST /emails`, `GET /stats`, the 503 during shutdown) and `src/main.ts` (listen, wire the signals, print the counts, exit 0). Verify with `pnpm tsgo` and `pnpm check`.
- [x] 2.3 Tests for job-worker with a fake mailer and fake timers: never more than three running, the retry of a 503, the timeout of `/hang`, `/bad` not retried, 202 before sending, the counts add up, and the shutdown (intake 503, a drain that finishes in time, the deadline that cancels the rest). Verify with `pnpm vitest run src/tests/backend-examples.test.ts`.
- [x] 2.4 Run it for real: `npm start`, post ten emails with `curl` including `/hang` and `/bad`, read `/stats`, press Ctrl+C and read the three steps in the log. Verify the same results as the spec.

## 3. ws-server

- [x] 3.1 Create `examples/ws-server/` with `package.json`, `tsconfig.json`, `src/bus.ts`, `src/feed.ts`, `src/prices.ts` and `src/prices-handlers.ts` (`watchSymbol` under keyed `latest`, `guardIdle` with `race`, `take` and `delay`). Verify with `pnpm tsgo` and `pnpm check`.
- [x] 3.2 Write `src/server.ts` (`buildServer`: the route `/prices`, a controller for each socket, the messages, the shutdown) and `src/main.ts`. Verify with `pnpm tsgo` and `pnpm check`.
- [x] 3.3 Tests with `app.injectWS`: subscribe and ticks, a message that is not understood, replacement, two sockets, the close stops the feed, the idle close with code 1001, the shutdown. Verify with `pnpm vitest run src/tests/backend-examples.test.ts`.
- [x] 3.4 Run it for real with a WebSocket client: subscribe, replace, close, and Ctrl+C with a socket open. Verify the same results as the spec.

## 4. Docs and integration

- [x] 4.1 Write the three READMEs (what it shows, how to run, a table of what you do and what happens, the three steps of the shutdown, and the note on the queue starting waiting calls during an abort), add the three "Backend examples" rows to `examples/README.md` and the line to `CHANGELOG.md` under `Unreleased` (`### Added`). Verify with `pnpm docs:check` and `pnpm llms:check`.
- [x] 4.2 Run `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm templates:check && pnpm vitest run && pnpm build`. Verify all pass.
