# Proposal

## Why

To stop a request with its task, a handler today needs setup on the bus: `contextPlugin({ fetch: fromSignal(signalFetch) })`. `signalFetch(signal)` is a factory, not a `fetch`, so it cannot be called inside a handler. A reader must learn two helpers and a plugin to get one bound `fetch`. Every other effect (`retry(ctx, fn)`, `timeout(ctx, ms, fn)`) takes `ctx` first and needs no `fromSignal`.

## What Changes

- **BREAKING** `signalFetch` becomes an effect: `signalFetch(ctx, input, init)` calls the global `fetch` with `ctx.signal`. A `signal` in `init` is joined with it, so the request stops with whichever aborts first. It needs no plugin. The factory form `signalFetch(signal)` is removed.
- `effectsPlugin({ fetch: signalFetch })` gives every handler a `ctx.fetch` (the `fetch` is the effect with `ctx` bound), so `fromSignal(signalFetch)` is no longer needed. `fromSignal` stays for clients that have no effect, such as `axios`.
- A signal that is not a task's (a React Query `signal`) goes in as `signalFetch({ signal }, url)`: the first argument is anything with a `signal`.
- Docs lead with `signalFetch(ctx, url)`; the old form goes to the migration note. English and Russian pages, `llms.txt`, the comments of the starter templates, `CHANGELOG.md`.

## Capabilities

### New Capabilities

### Modified Capabilities
- `signal-fetch`: the requirement for `signalFetch` changes from a factory of a bound `fetch` to an effect with `ctx` first.

## Impact

- `src/signal/fetch.ts` (the new signature; doc comment), `src/signal/fetch.test.ts`, `src/tests/types.test.ts`. The key list of the `signal` entry in `src/tests/exports.test.ts` does not change.
- Docs: `docs/pass-the-signal.md`, `docs/context.md`, `docs/cancel-stale-requests.md`, `docs/policies.md`, `docs/package.md`, `docs/effects.md` if it names the old form, `llms.txt`, the Russian pages of the same names in `docs/ru/`.
- Comments in `packages/create-nanoeffects/templates/*/src/bus.{js,ts}` say "Bind the signal once with signalFetch": reword to the new form.
- `nanoeffects/signal` grows by about 9 B (the extra parameters), so its `size-limit` goes from 0.8 kB to 0.81 kB. The core is untouched.
- Users of 0.31 to 0.34 who call `signalFetch(signal)` or `fromSignal(signalFetch)` must migrate: `CHANGELOG.md` `### Breaking` says how.
