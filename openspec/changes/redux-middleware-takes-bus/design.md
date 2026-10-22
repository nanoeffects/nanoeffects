# Design

## Context

`src/store/redux/effects.ts` builds the bus with `createBus({ ...busOptions, onError: default, context: contextOf })`, where `contextOf(task)` returns `{ ...context, store }` and `store.dispatch` marks the action with the type of the task that dispatches it (a `WeakMap` of actions to types). `middleware.ts` has `nanoeffectsMiddleware(bus, options)`, the generic part: send each action to the bus after the reducers, with `filter`. `Bus` has the `addContext` hook that plugins chain (`effectsPlugin` is the model). `contextPlugin` and the `context` option of `createBus` add fields as well. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- The middleware works with a bus that was made without knowing about Redux.
- The behavior a reader relies on stays (store on tasks, no self-loop, a failing handler does not break `dispatch`).

**Non-Goals:**
- Support for installing the middleware on two stores with one bus. One bus, one store, as today; a second install replaces the store in the context.

## Decisions

**1. `createEffectsMiddleware(bus, options?)` returns the middleware itself.**
With the bus in hand, `{ bus, middleware }` returns the bus the caller already has. The result is the function Redux wants: `getDefault().concat(createEffectsMiddleware(bus))`. Alternative: keep `{ bus, middleware }` and add `bus` as an option. Rejected: a result that repeats an input, and an optional bus keeps the old form alive. The call is **BREAKING** and says so in the changelog with the migration (`const effects = createEffectsMiddleware(); effects.bus.on(...)` becomes `const bus = createBus(); const middleware = createEffectsMiddleware(bus); bus.on(...)`).

**2. `ctx.store` comes through `bus.addContext`.**
The middleware reads `bus.addContext`, chains to it, and for each new task context sets `ctx.store` to an object with `getState` and a `dispatch` that records the task type in the `WeakMap`. This is the same mechanism as `effectsPlugin`, so the two compose in either order. The hook is installed when `createEffectsMiddleware(bus)` is called (the bus exists), and `store` is read lazily (`api` is set when Redux installs the middleware), so a task before that has no `store`. The hook receives the context object that already has `type` (checked in task 1), which is what the origin tracking needs. If it does not, the task falls back to the `event` of the context. Alternative: ask the caller to pass `context: (task) => ...` to `createBus`. Rejected: the caller would need the store logic and the internals (`origins`).

**3. The error rule moves to the middleware.**
Before, the middleware's bus had a default `onError` that reported errors. A bus of the caller has none by default, and `emit` then throws the first handler error into `dispatch`. The middleware wraps its `emit` in `try`/`catch` and writes it with `console.error` in the format of `report`. It does not import `report`: from the `redux` entry that import moves `report` into a chunk of its own, and the `createBus` bundle grows by 3 B (the size limit caught it; checked by building with and without the import). When the bus has an `onError`, `emit` does not throw and nothing changes. Alternative: document that the bus needs an `onError`. Rejected: a guarantee that depends on a setting somewhere else is easy to lose; the catch is four lines.

**4. Options: `filter` stays, `context` goes.**
`context` extended the fields of the middleware's own bus. A caller's bus already has `createBus({ context })` and `contextPlugin`. `EffectsMiddlewareOptions` becomes `{ filter? }`; the exported type name stays so imports do not break (it is now `NanoeffectsMiddlewareOptions`-shaped; the two may be merged, task 1).

**5. Typing stays with `WithContext`.**
`ctx.store` is typed by `WithContext<{ store: ReduxStoreApi<RootState> }>` on the event map of the bus, as before; docs/stores.md keeps its "Type `ctx.store` (optional)" block, adapted to `createBus<Events>()`.

## Risks / Trade-offs

- [Breaking change for users of `{ bus, middleware }`] → a **BREAKING** changelog entry with the one-line migration; the package is 0.x and the shape was a day-to-day convenience, not a contract of the bus.
- [`addContext` is called for every task, so the hook costs one object per task] → it is the cost `effectsPlugin` already pays; the middleware adds one small object with two functions per task, the same as before (the old `contextOf` built it too).
- [A handler error is reported by `console.error` while the bus has its own reporter] → only when the bus has no `onError`; the report names the event type, as the old default did.
- [Two stores on one bus] → not supported; stated in the doc comment.

## Open Questions

- None that change the specs. Whether `addContext` receives `type` is checked first thing in the tasks.
