# Design

## Context

`signalPlugin` (`src/signal/plugin.ts`) wraps `bus.emit` and `bus.addContext` only. `ListenerOptions` (`src/core/types.ts`) has `traceId`, which `tracePlugin` reads and a bus without it ignores. `nanoeffects/observable` has `createObserve` and `Subject`, both over `source.on`. `take(ctx, event, { predicate, signal })` waits for one payload. `createBus` is at 1296 B of 1.3 kB. See proposal.md for why.

## Goals / Non-Goals

**Goals:**
- A listener bound to a signal with one plugin and no core code.
- An event as a stream for `for await`, with abort, bounded memory and no lost payload between the call and the first read.

**Non-Goals:**
- `Symbol.dispose` on the unsubscribe function. `signal` already covers the lifetime; a typed `Disposable` result would mean retyping every overload of `On<E>` or a dispose property that `using` does not accept when optional. Decide later, on its own.
- Replay of old values, `complete`, `error` (an event of a bus does not end, as in `Subject`).
- A third overflow mode that throws, and a "latest only" shortcut: `buffer: 1` with `drop-oldest` is that.

## Decisions

**1. `signal` is a field of `ListenerOptions`, read by `signalPlugin` (types in core, code in the plugin).** Same shape as `traceId`: a type-only field, so `createBus` stays at its size and a plugin used on a condition type-checks. Alternative: refine `SignalBus.on` with a new overload set. Rejected: `On<E>` has nine overloads, and a second copy breaks inference for creators and commands.

**2. The plugin wraps `bus.on` and `bus.once`, like `matchPlugin`.** It finds the methods when it is used, so order with `matchPlugin` and `devPlugin` does not matter, passes `options` on, and returns the same bus. Per call: no `signal` in the options means a direct call to the previous method, no allocation. With a `signal`: if aborted, return a no-op unsubscribe; else subscribe, link with `onAbort({ signal }, unsubscribe)` (the shared hub, one real listener per signal) and return an unsubscribe that also unlinks. For `once`, the link is dropped when the handler has run; the plugin wraps the handler to do that only when a signal is given.

**3. Abort only unsubscribes.** A handler that already runs is not aborted, as `off` does not abort one. A caller who wants that uses `ctx.signal` or `emit(call, { signal })`. Alternative: abort the running tasks too. Rejected: the signal belongs to the subscriber, not to the emit, and the two meanings would mix.

**4. `off(event, fn)` does not release the link.** The abort listener stays until the signal aborts or the listener is unsubscribed through the returned function. `off` finds the listener by `fn`; tracking links by `fn` would add a map to the hot path of a rare call. Documented as a limit; the link holds only the unsubscribe closure.

**5. `events` lives in `nanoeffects/observable`, not in a new entry.** It is the same family (an event as a stream), uses only `source.on`, and a new entry costs `package.json` exports, a size-limit line, `stability.md` and the exports test. The entry has no notrace build, so nothing else changes. Alternative: `nanoeffects/events`. Rejected as too many entries for one function; revisit if the iterator grows options.

**6. `source` is anything with `on`, plus an optional `signal`.** A bus works, and so does a task context: then the iterator ends with the task, as `take(ctx, …)` does. The type is `Pick<Bus<E>, "on"> & { signal?: AbortSignal }`; `ctx.on` already unsubscribes at abort, the iterator only has to end its pending read.

**7. The iterator is a small object, not an async generator.** An `async function*` starts listening at the first `next()`, so payloads emitted before it are lost; the iterator subscribes at the call. State: a queue (array with a head index, so `shift` does not cost O(n) for a large buffer), one waiting `{ resolve, reject }` at most (the protocol allows a second `next()` before the first settles; they queue as promises in order, handled by a list of waiters), and a `done` flag. `[Symbol.asyncIterator]()` returns itself. `return()` and abort share one `finish(reason?)`.

**8. Defaults: `buffer: Infinity`, `overflow: "drop-oldest"`.** Nothing is lost by default, as in `emittery`; a bound is opted into, and then the freshest data wins, which is what UI streams want. Options are read with `??`, so a `null` falls back to the default.

**9. Abort after buffered values rejects at once and drops the buffer.** The library rule is that an aborted task delivers no result (AGENTS.md). Alternative: drain the buffer first, then end. Rejected for consistency with `take`.

**10. `fromSignal` is a marker, read lazily through a non-enumerable getter.** `fromSignal(make)` returns an object tagged with a symbol from `src/core` (as `scope-key.ts`), so `nanoeffects/context` checks the symbol and imports nothing from `nanoeffects/signal`. In `addContext`, `contextPlugin` defines, for each marked field, a getter with `enumerable: false` that calls `make(ctx.signal)` on first read and replaces itself with the value. Why not eager: a client per task is work and memory for a handler that never uses it. Why not enumerable: the child context of `ctx.run` is built as `{ ...parent, ... }` (`forkTask` passes the parent as `bus.ctx`), and a spread would read the getter and hand the child the value of the parent. Non-enumerable fields are skipped by the spread, by `Object.entries` and by a logger, so nothing is built by looking, and the child's own `addContext` defines its own getter. Alternative: the factory form of `contextPlugin` with `signal` added to `ContextTask` (eager, one line). Kept as a possible later step; not done, to avoid two ways.

**11. A child needs no special case.** Because the getter is not enumerable, the spread of the parent leaves it out, `key in ctx` is false in the child, and the same "a field that the context already has is not replaced" rule defines the child's own getter. One descriptor per marker is shared by every task (the getter takes its task from `this`) and kept in a `WeakMap`, so a task that does not read the field allocates nothing for it. The values of the fields object are still read each time a task is made, as before.

**12. Recipes are docs, not API.** `docs/query-libraries.md` shows React Query, SWR and RTK Query with `emit(call, { signal })` (exists), `fromSignal` for the client, `bus.on(…, { signal })` in `useEffect`, and `events` writing a stream into the cache. Each library's signal API is checked against its own docs when the page is written; a recipe that cannot be checked is left out.

## Risks / Trade-offs

- [A getter on the context is slower than a data property] → only for marked fields. Measured with `scripts/bench-from-signal.mjs` (100 000 tasks, mean of 15 rounds): a plain field about 52 ms, a `fromSignal` field that is not read about the same (1.00x), and one that is read about 110 ms (2.1x, the cost of `make` and of replacing the getter with the value).
- [A user copies `{ ...ctx }` and loses the field] → documented next to `fromSignal`; `ctx.http` is read before copying.

- [`signal` is silently ignored without the plugin] → the same as `traceId` and a scope; the docs say it at the first use, and the dev entry is not asked to warn (no dev code in plugins).
- [The `signal` and `observable` size limits are tight (0.6 kB, 0.5 kB)] → measure with brotli before and after; raise only with the numbers in the commit, cut code first.
- [An unbounded default buffer can grow if the loop is stuck] → documented next to `buffer`; `buffer` is one option away.
- [A task context whose task aborted still holds the iterator] → the finish path unsubscribes at abort, tested.
- [Interaction with `devPlugin` leak count] → an iterator is one listener until it ends; the test checks `bus.get(event)` after `break` and after abort.

## Migration Plan

Additive. No migration, no break. Roll back by removing the exports, the wrappers and the getter.
