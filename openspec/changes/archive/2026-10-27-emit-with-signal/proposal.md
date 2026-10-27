# Proposal: emit-with-signal

## Why

React Query and SWR own the loading state, the cache, deduplication and revalidation of a request. nanoeffects is good at what runs inside it: `retry`, `timeout`, policies, an abort that reaches the handler. The two fit together as `queryFn: () => bus.emit(getUser(id))`, with one gap: React Query gives `queryFn` an `AbortSignal` and aborts it when the component unmounts or the key changes, and `bus.emit` has no way to take it. The task keeps running, `ctx.signal` never aborts, and the stale response is not dropped by the bus.

Writing our own `isLoading`/`data` store was considered and dropped: it would be a second, smaller React Query to maintain.

## What Changes

- New plugin `signalPlugin` in its own entry `nanoeffects/signal`. After `bus.use(signalPlugin())`, `bus.emit(call, { signal })` links the tasks that this emit starts to the outside `AbortSignal`: when it aborts, their `ctx.signal` aborts with the same reason. A signal that is already aborted aborts them at once.
- It works for the call forms of `emit` (a command, a job, an action creator call, an event object), as the scope does; the string form `emit("type", payload)` does not take it.
- It returns what `emit` returns, so `await bus.emit(getUser(id), { signal })` is the `queryFn` of React Query, and the same for SWR's `fetcher`.
- `{ signal }` and a scope share the second argument. `signal` is already a reserved field of the context that a scope cannot set, so `scopePlugin` ignores it and `signalPlugin` takes it, in either order of the two plugins. A scope and a signal can be given in one object.
- Docs: a page "Use nanoeffects with React Query and SWR" with one recipe for each (JS first, `queryFn` / `fetcher` call `bus.emit`), what each side owns, and the note that `isLoading` and `data` come from the library, not from `emit`. Linked from `docs/react.md`, `docs/plugins.md`, `llms.txt`, `CHANGELOG.md`.

Out of scope: a state store with `isLoading`/`data` (`job.status()`), a cache, adapters that import `@tanstack/react-query` or `swr` (the recipe is a few lines the reader owns), a `signal` option for the string form of `emit`, changes to `createBus`.

## Capabilities

### New Capabilities

- `emit-signal`: an outside `AbortSignal` given to `emit` aborts the tasks that emit starts.
- `docs-query-libraries`: the docs page and recipes for React Query and SWR.

### Modified Capabilities

None.

## Impact

- New `src/signal/` (plugin, tests), a new entry `nanoeffects/signal` in `package.json` exports, `tsdown` config, `size-limit` (a small new entry), `src/tests/plugin-matrix.test.ts` (installer and probes), `src/tests/exports.test.ts`.
- No change to `src/core`: `createBus` is at 1293 of 1300 bytes, so the plugin uses only `bus.emit`, `bus.addContext` and `onAbort`.
- Types: the bus gets an `emit` that takes `{ signal }` for the call forms; `src/tests/types.test.ts`.
- `docs/` (new page, `react.md`, `plugins.md`, `package.md`), `scripts/docs-stubs.d.ts` (`useQuery`, `useSWR`, `@tanstack/react-query`, `swr` as `any` modules), `llms.txt`, `CHANGELOG.md`.
