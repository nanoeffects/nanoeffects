# Design: emit-with-signal

## Decisions

**A plugin, not a change of `emit` in the core.** `createBus` is at 1293 of 1300 bytes (see `job-lifecycle-outcomes`, where one extra closure cost 37 bytes). Linking a signal needs only things the bus already exposes to plugins: `bus.emit` to wrap and `bus.addContext`, which is called with every new task context. It follows the pattern of `scopePlugin`, so it is optional, tree-shakeable and tested by the plugin matrix.

**Its own entry, `nanoeffects/signal`.** `actions` is at 2683 of 2700 bytes, and `scope` at 737 of 750, so the plugin goes into a new entry like `match`. Its limit in `size-limit` is set from the measured size.

**How tasks are found.** The plugin wraps `bus.emit`. For a call with a `signal` in its second argument it stores the signal in a variable `current` for the duration of the synchronous call and restores the previous value in `finally`. Its `addContext` hook runs for every context made in that time: if `current` is set it subscribes to the signal and aborts the context with the reason of the signal. `emit` is synchronous up to the point where handlers are started, so the command task and the tasks of the listeners are all created inside the call. This avoids the matching by type and payload that `scopePlugin` has to do (its known limit) because the signal is bound to the time of the call, not to a payload. A nested `bus.emit` of a handler that runs inside the call (a listener that emits synchronously) sets its own `current` or clears it for its time, so it is not linked unless it was given a signal.

**Abort goes through the context, not through a parent signal.** A task context's `abort(reason)` aborts its own controller, which its children (`ctx.run`, policies) follow, so `latest`, `retry` and `timeout` see an ordinary abort.

**Subscription cleanup.** The plugin keeps one subscription per `emit` on the outside signal (`onAbort`, one real listener per signal), not one per task. It aborts all contexts made by that emit. It removes the subscription when the signal aborts, or when the promise that `emit` returned settles (the plugin chains `finally` only for an emit that was given a signal and returned a promise). An `emit` that returns no promise (an event) removes it after a microtask once every context it made is finished or aborted; a context has no public "finished" hook, so for events the first version removes it at the next abort or after the synchronous call if no listener returned a promise. The leak test (task 1.2) decides whether this rule is enough; the rule may be simplified when the test shows a simpler one that passes.

**Second argument shared with the scope.** A scope is a flat object whose keys go on `ctx`; `signal` is already in the reserved set of `scopePlugin` (`src/scope/plugin.ts`), so it is never put on `ctx` by a scope. `signalPlugin` reads `signal` from the same object, and does not remove it, so both plugins see it whatever the order. The type is `EmitScope<E, F> & { signal?: AbortSignal }` for the call forms.

**Types.** The plugin returns the bus with `emit` typed with the extra option (the "refines the bus shape" kind of plugin, like `effectsPlugin`), so `const bus = createBus().use(signalPlugin())` keeps one binding. The string form of `emit` is not extended.

**An aborted signal at the start.** `onAbort` calls at once for an aborted signal, so the contexts are aborted before the handler runs. The handler still runs (its first await can stop on `ctx.signal`). A change that skips the handler is possible later and is not needed for React Query, which does not call `queryFn` with an aborted signal.

**A sync handler.** A handler that returns without a promise is finished with the call, so its link is removed at once (a command's result is the only sign of an end that the plugin has). An abort callback set up by such a handler is not reached by a later abort. Documented in the page and the JSDoc.

**Docs.** One page with two recipes. The libraries are declared as `any` modules in `scripts/docs-stubs.d.ts`, as `react` is. Checked against the docs: React Query gives `queryFn` a `signal` and aborts it for a query that is inactive or out of date; the SWR docs say the fetcher gets only the key and mention no signal. So the SWR recipe has no `{ signal }`, and the page says why.

## Risks

- Tasks are linked by the time of the call. A plugin that wraps `bus.emit` and delays the call (a queue) would break this; no plugin of the library does. The plugin matrix covers the order of the library's plugins.
- A listener that emits synchronously inside the call and expects to be linked gets no link unless it passes its own signal. Documented.
- Cleanup of subscriptions when a task ends without an abort (see above).
- `{ signal }` in the second argument of a bus without `signalPlugin` is silently ignored, as a scope is without `scopePlugin`. Accepted for the same reason; `devPlugin` could warn later.

## Open questions

- Should an already aborted signal skip the handler? Default: no (see above).
- Is the cleanup rule of "one subscription per emit" enough for an event with slow listeners? The leak test decides.
