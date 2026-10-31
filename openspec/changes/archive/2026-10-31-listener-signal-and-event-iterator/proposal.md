# Proposal

## Why

A subscription made outside a task (a React `useEffect`, a script, a test) is removed by keeping the `unbind` function and calling it by hand. The platform has a shorter way: `addEventListener(type, fn, { signal })`. Code that already holds an `AbortSignal` (React Query, a router, a component) has no way to hand it to `bus.on`.

A stream of one event has no form that fits modern JavaScript either. `take` waits for one payload, `Subject` needs an Observable library to read it. `for await (const query of events(bus, queryChanged))` is what Node (`events.on`) and `emittery` give.

Values that need a signal (an `axios` instance, a database client) are built by hand for every request. A field of the context cannot see the signal of its task, so `ctx.signal` is passed around instead of being wired once.

## What Changes

- `signalPlugin` also reads `{ signal }` in the options of `bus.on` and `bus.once`: the listener is removed when the signal aborts, and is not added if the signal is aborted already. `createBus` does not change.
- A new function `events(source, event, options)` in `nanoeffects/observable` returns an `AsyncIterableIterator` of the payloads of one event. It ends with `signal`, has a bounded buffer and says what happens when the loop is slower than the emits.
- `fromSignal(make)` in `nanoeffects/signal` marks a field of `contextPlugin` as a value built from the signal of each task, on first read. `ctx.http` is then an `axios` instance bound to that task and to no other.
- `docs/query-libraries.md` gets recipes that use all three with React Query, SWR and RTK Query.
- `ListenerOptions` gets `signal?: AbortSignal` as a type only. Without `signalPlugin` it is ignored, like `traceId` without `tracePlugin`.
- Docs, `CHANGELOG.md`, examples and the plugin matrix follow.

Not in this change: `Symbol.dispose` on the unsubscribe function (a separate decision, see design), meta-events of listeners, `captureRejections`.

## Capabilities

### New Capabilities
- `listener-signal`: removing a listener of `on` and `once` with an outside `AbortSignal`, through `signalPlugin`.
- `signal-bound-fields`: context fields built lazily from the signal of the task, marked with `fromSignal`.
- `event-iterator`: one event of a bus or a task context as an async iterator, with a signal, a buffer and an overflow policy.

### Modified Capabilities

None. `emit-signal` keeps its requirements: the second argument of `emit` is untouched. `public-surface` pins the exports of each entry through tests, and the test lists change with the new export, not the requirement.

## Impact

- `src/signal/plugin.ts` (wraps `bus.on` and `bus.once`), `src/core/types.ts` (`ListenerOptions`, a type), `src/observable.ts` (the iterator), tests next to them, `src/tests/plugin-matrix.test.ts`, `src/tests/exports.test.ts`, `src/tests/types.test.ts`.
- `src/context/plugin.ts` (reads the marker), `src/core` (one symbol file for the marker, like `scope-key.ts`), `src/signal` (`fromSignal`).
- `docs/query-libraries.md` (new recipes), `docs/context.md`.
- `package.json` size-limit: `signal` (0.6 kB), `context` (0.2 kB) and `observable` (0.5 kB) may need a raise, with the measured numbers in the commit.
- `docs/plugins.md`, `docs/observable.md`, `docs/guide.md` or `docs/react.md` for the `useEffect` case, `llms.txt` only if a page is added (none planned), `CHANGELOG.md` under `Unreleased`.
- `createBus` size: unchanged (types only).
