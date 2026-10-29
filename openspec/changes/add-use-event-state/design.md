# Design

## Context

`reactPlugin` (`src/react/plugin.ts`) adds one method, `useEmitter`, as a closure over the bus with three overloads (name, `FreeActionCreator`, `ActionCreator<P>`). See proposal.md for why the way back (bus to state) needs a hook. The `react` entry has its own size limit and may import only `react` and files of `src/core`.

## Goals / Non-Goals

**Goals:**
- Keep `useState` as the shape: same tuple, same lazy `initial`, same `setState`.
- One idea in one call: the event is the source of the state.

**Non-Goals:**
- A reducer form, replay of the last payload, or `traceId` options. The bus has no stored values and the first version stays small.
- A store (`useSyncExternalStore`): the state lives in the component, not outside React.

## Decisions

- **`useState` + `useEffect`, not `useSyncExternalStore`.** There is no external value to read: the bus has no state and no snapshot. A snapshot store would have to keep the last payload outside the component, which is the replay that is out of scope. Plain state also lets `setState` stay the real one.
- **The listener is `(payload) => setState(() => payload)`.** `setState(payload)` would call a function payload as an updater; the wrapper stores it as a value.
- **`useEffect(() => bus.on(event, listener), [event])`.** `bus.on` returns the unbind function, which is the cleanup. `event` is the only dependency: a name or a creator is stable in practice, and a changed one resubscribes. The listener only calls the stable `setState`, so it has no other dependency.
- **Three overloads like `useEmitter`.** The same event types give the same inference; `FreeActionCreator<K>` takes the payload from the event map. The implementation signature takes `string | Creator` and passes the event to `bus.on` after the overloads have checked it.
- **No `equals` option.** React skips a render for an `Object.is`-equal state; a custom comparison belongs to the reducer form later.
- **Events are lost until the effect runs.** An event emitted between the first render and the commit is not seen. This is documented, with the advice to read a current value into `initial` when it matters. Subscribing in render would be wrong under StrictMode and concurrent rendering.

## Risks / Trade-offs

- [An event is missed between render and commit] → documented; the same limit as any `useEffect(() => bus.on(...))`.
- [`react` size limit] → measure `dist/react.js` brotli before and after; raise the limit in `package.json` by the measured growth only.
- [Plugin order] → the hook adds a method only, with no work at `bus.use`, so `plugin-matrix.test.ts` needs a probe only if `reactPlugin` is already one of its installers.
