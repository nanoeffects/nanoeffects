# Design

## Context

The examples so far are browser apps, each with its own `package.json` and a `tsconfig.json` whose `paths` map `nanoeffects/*` to `src`; the root `tsconfig.json` includes `examples`, so `pnpm tsgo` checks them, and `vitest.config.ts` maps `nanoeffects/*` to the sources for tests but includes only `src/**/*.test.ts`. Node typings already resolve at the root (`src/tests` import `node:*`). `fastify` is a dependency of the chat example only, so a TypeScript Fastify server does not type-check from the root without a root dev dependency; this change adds `fastify`, `@fastify/websocket` and `@types/ws`. The first version of these examples used `node:http`; it was replaced by Fastify because nobody writes a bare server any more and a reader copies what looks like their own project. See proposal.md for why these programs.

## Semantics checked before the design

Three questions were checked with throw-away tests (removed), and the answers shape the worker:

- **(a) Unmounting a module does not stop a running job.** After `app.unmount(worker)` with one call running and two waiting under `queue`, all three still ran to the end, and the `module.on` listeners of the outcomes were gone, so a counter would freeze. The module's task owns its listeners, its bindings and its `spawn`ed tasks, but not the calls it served. So the shutdown cannot be "unmount the worker". It aborts a signal that the calls were given.
- **(b) `bus.emit(job(payload))` works from a plain `node:http` handler, outside any task.** The outcomes `pending`, `success`, `fail` and `cancel` reach `module.on` listeners. A failing handler does not reject the promise that `emit` returns: it resolves, and the error arrives in the outcome `fail`. So the intake does not need a `catch` for the result and reads the failure from the counters.
- **(c) `signalPlugin` passes `{ signal }` to `bus.emit(call, { signal })`.** A command without a policy rejects with the abort reason and its handler sees `ctx.signal.aborted`; a call under `queue` resolves without a result and ends with the outcome `cancel`.

One more observation, which the README says out loud: when the shutdown signal aborts, the queue frees the slot of the call that was running and starts the next waiting one before that call's own context is aborted. A waiting call therefore runs its handler up to the first `await` and then ends with `cancel`. The fake mailer is safe (it starts a timer and the abort clears it), and the README tells the reader that a handler with a side effect before its first `await` should check `ctx.signal.aborted`. The behavior is not what a skipped waiting call would suggest, so it is reported here and left out of this change; if it is judged a library bug it is a separate fix.

## ws-server

- **Files.** `src/bus.ts` (`signalPlugin`), `src/feed.ts` (a fake price feed: `priceOf(symbol, tick)` is a deterministic walk, so a test knows the numbers), `src/prices.ts` (the commands `watchSymbol` and `guardIdle` and the event `heard`, no bus), `src/prices-handlers.ts`, `src/server.ts` (`buildServer({ feed, idleMs, tickMs })` returns a Fastify app with `@fastify/websocket` and the route `GET /prices`, and `shutdown`), `src/main.ts`.
- **One controller for each socket.** On connection: `const controller = new AbortController(); socket.on("close", () => controller.abort())`. Every `bus.emit` for that socket gets `{ signal: controller.signal }`, so closing the socket stops the subscription, the idle guard and anything they started.
- **Messages.** The client sends `{ "subscribe": "BTC" }`; the server sends `{ "symbol": "BTC", "price": 101.5, "time": 1 }` for each tick and `{ "error": "..." }` for a message it does not understand. Each message of a socket emits `heard({ socketId })`.
- **`watchSymbol`** is a command under `latest(fn, { key: (call) => call.socketId })`: the key keeps the sockets apart, so a new subscription of one socket aborts only the old one of the same socket. Its handler calls `poll(ctx, send, tickMs, { leading: true })`, where `send` writes the price of the feed to the socket; an abort ends the poll.
- **`guardIdle`** is a command with a loop: `race(ctx, { heard: (child) => take(child, heard, { predicate }), idle: (child) => delay(child, idleMs) })`; the winner `idle` closes the socket with code 1001 and the loop ends, `heard` starts the wait again. The starters pass their own `child`, and the `predicate` keeps the sockets apart.
- **Shutdown.** `shutdown` aborts every controller, closes every client with code 1001 (`app.websocketServer.clients`) and awaits `app.close()`.
- **Tests.** `app.injectWS("/prices")` gives a client without a real port. A test subscribes and reads ticks, replaces the subscription and checks that only the new symbol ticks, sends nothing for longer than `idleMs` and sees code 1001, closes the socket and checks that the feed stopped being polled, and runs two sockets to see that one's subscription does not stop the other's.

## Goals / Non-Goals

**Goals:**
- Two programs that a Node developer can start, read in one sitting, and copy a pattern from.
- Real behavior under test: no browser, so the claims about cancelling and shutting down are checked in `src/tests`.

**Non-Goals:**
- Another framework than Fastify, a database, a queue library, tracing, or a docs page.

## Decisions

- **Fastify and `tsx`.** The glue between a framework and the library is small and the same everywhere: an `AbortController` for the work, abort it when the connection goes, pass its signal to `bus.emit`. `fastify` is a dependency of the example's own `package.json`, with `tsx` as a dev dependency for `npm start` and `npm run dev` (`tsx watch`). Node typings come from the root. NestJS was left out: its decorators and metadata do not pass the test toolchain.
- **api-server files.** `src/bus.ts` (the bus with `signalPlugin`, no events imported), `src/upstream.ts` (the PokeAPI client: functions that take `WithSignal`, built around a `fetch` that can be replaced), `src/profile.ts` (`createProfile(upstream)` returns the command `loadProfile`, whose handler is in `src/profile-handlers.ts`), `src/server.ts` (`buildServer({ upstream })` returns a Fastify app that does not listen, and `shutdown`), `src/main.ts` (listens on `PORT`, default 3000, and wires the signals). The command and its handler take the upstream as a parameter, so a test hands in a fake and the code has no global state.
- **The handler of `loadProfile`, read from the inside out.** The pokémon: `timeout(8000, retry(load, { times: 3, delay: 300, shouldRetry: isWorthRetrying }))`, the same rule as the pokédex. The abilities: `allSettled(ctx, names.map(askAbility))` where `askAbility` returns a starter `(child) => timeout(child, 3000, request)`, a rejected one becomes `text: null`. Starters pass their own `child` to the effect and not the outer `ctx`, so cancelling the group stops exactly that request.
- **Disconnect.** `const controller = new AbortController(); reply.raw.on("close", () => { if (!reply.raw.writableFinished) controller.abort(); })`. It is the response that tells when the connection ends: `request.raw` emits `close` when the request body is read, not when the client leaves. The handler awaits `bus.emit(loadProfile(name), { signal: controller.signal })`. After an abort the `catch` sees `reply.raw.destroyed` and returns the reply without writing. The log line is `client left, upstream cancelled`.
- **Status mapping** in one function from the error: `HttpError` 404 → 404; a `DOMException` named `TimeoutError` → 504; anything else → 502. A 404 is not retried.
- **Shutdown of api-server.** A `Set` of the controllers in flight. On a signal: abort every controller (a request in flight answers 503 and its connection is closed), then `await app.close()`, which stops listening and waits for the connections; exit 0 after that or after 2 s (`setTimeout(..., 2000).unref()`). `GET /health` reads the size of the set.
- **job-worker files.** `src/mailer.ts` (`createMailer({ shouldFail })` with the default schedule "every fourth attempt", the `/hang` and `/bad` subjects, and a `MailError` with a `status`), `src/jobs.ts` (`sendEmail = createJob<Email, Receipt>("email/send")` and the action `idle`), `src/worker.ts` (`createWorker({ mailer, drainMs })`), `src/server.ts` (`buildServer({ worker })`, a Fastify app that does not listen), `src/main.ts`.
- **The worker.** It makes the bus with `signalPlugin` and mounts one module that binds `sendEmail` to `queue({ concurrency: 3 })(retry(timeout(1000, attempt), { times: 3, delay: backoff, shouldRetry }))`. `shouldRetry` is true only for a `MailError` with a status of 500 or more, so a 400 and a `TimeoutError` are not retried. `backoff` is `200 * 2 ** attempt`. The module counts the outcomes with `module.on(sendEmail.pending, …)` and the other three, and emits `idle` when `queued + running` reaches 0.
- **`accept(email)`** counts `accepted`, calls `bus.emit(sendEmail(email), { signal: stopping.signal })` without awaiting it, and returns the id. The id is a counter, which is enough to show the 202.
- **Counts.** `accepted` is counted at `accept`, `started` at `pending`, and the three closing outcomes at their events. `queued = accepted − started`, `running = started − sent − failed − cancelled`. They add up because a policy reports exactly one closing outcome for every `pending` (AGENTS.md, "Policies tell the job about each call"). A call is never dropped before it starts under these settings (no `limit`), so no extra counter is needed.
- **Shutdown of job-worker** as one command `shutdown` of the worker: `accepting = false`; then `if (queued + running > 0) await race(ctx, { drained: (child) => take(child, idle), deadline: (child) => delay(child, drainMs) })`; then `stopping.abort()`; then wait one turn for the `cancel` outcomes and return the counts. `race`, `take` and `delay` are the effects the docs already teach, and fake timers drive it in a test. The caller prints the counts and exits 0. The README lists the three steps and the command to see them: `npm start`, ten `curl` posts, Ctrl+C.
- **Why `idle` is an event and not a polled timer.** A poll would add a timer to reason about; `take` on an event the module emits when the count reaches zero is one line and exact.
- **Tests, one file in `src/tests`.** The HTTP layer is tested with `app.inject` and instant fakes, which needs no port. The disconnect test is the one that needs a socket: the app listens on port 0, a client `fetch` is aborted, and the test checks that the signal the fake upstream received is aborted. The timing cases (a 3 s ability, a hanging mailer, the retry pause, the drain deadline) use the core factories directly with fake timers, so no socket sees a fake clock. Names are spelled out (`harness`, `upstream`, `mailer`, `worker`, not abbreviations), and `noPayload` comes from `test-helpers`.
- **README and index.** A table of "what you do, what happens, which piece" in each README, as the other examples have. `examples/README.md` gets a "Backend examples" heading with three rows that say they need Node and no browser; the StackBlitz link is left out because these run a server.

## Risks / Trade-offs

- [PokeAPI is a public service] → the same politeness as the pokédex: few requests, and the tests use a fake.
- [`tsx` is one more tool] → a dev dependency of the example only; the README names Node 18+ and `npm install`.
- [A real socket in a test can be flaky] → port 0, one server per test, closed in `afterEach`, instant fakes; only the disconnect test waits, and it waits on a promise the fake upstream resolves when it sees the abort.
- [The queue starts waiting calls during an abort] → described above and in the README; not hidden, not fixed here.
- [The fake mailer's schedule is global state] → it is a parameter of `createMailer`, and the tests give it their own.

## Open Questions

None that change the specs.
