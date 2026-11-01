# Proposal

## Why

A handler loses its signal when one request in it does not get `ctx.signal`. Today `devPlugin` sees this only when the handler then emits, and `getLostSignalsCount` counts only those emits. A request that the cancel did not stop, in a handler that does not emit after it, is invisible. Passing the signal by hand to every request is also the root of the problem: the fix that cannot be forgotten is a client that already has the signal.

## What Changes

- `devPlugin` follows the `fetch` requests that a handler makes (Node, through `AsyncLocalStorage`), and counts a request that was still running when its task was cancelled and did not stop. It is a new kind of lost signal, `request`, in `getLostSignals(bus)` and `getLostSignalsCount(bus)`, and it is warned about once. The option `requests: false` turns it off.
- `signalFetch` in `nanoeffects/signal`: a `fetch` bound to a signal, for `fromSignal`. `contextPlugin({ fetch: fromSignal(signalFetch) })` gives every handler a `ctx.fetch` that stops with the task, with no signal passed by hand.
- The lint rule gets `requireContext: true`: inside a policy handler, every call that waits must go through `ctx` (a call on ctx, or `ctx` as an argument), so a bound client is the only way to make a request.
- Docs: a section on binding the signal once, and the counting of requests, in `docs/pass-the-signal.md` (English and Russian), and the changelog.

Not in this change: tracking requests in the browser (there is no async context there), and clients other than `fetch` (axios and drivers are bound with `fromSignal` by their own `create`).

## Capabilities

### New Capabilities
- `signal-fetch`: `signalFetch(signal)`, a `fetch` that carries a given signal.

### Modified Capabilities
- `dev-diagnostics`: `devPlugin` follows the requests of a handler and counts the ones that kept running after a cancel.

## Impact

- `src/dev/` (the request tracker, the option, the `request` kind), `src/signal/` (`signalFetch`), `examples/lint/` (`requireContext`), `docs/pass-the-signal.md` and its Russian page, `CHANGELOG.md`.
- `size-limit` of `dev` and `signal` rise a little. `createBus` does not change.
