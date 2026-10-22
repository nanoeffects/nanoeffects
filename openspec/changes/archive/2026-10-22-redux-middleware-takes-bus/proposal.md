# Proposal: `createEffectsMiddleware` takes a bus that already exists

## Why

Today `createEffectsMiddleware(options)` creates its own bus and returns `{ bus, middleware }`. An app that already has a bus (with `effectsPlugin`, `contextPlugin`, `devPlugin`, a tracer, its own `onError`) cannot use it with Redux: the second bus is a different bus, so the handlers, modules and commands of the app do not see the Redux actions. The bus is the center of the library; the Redux middleware should plug into it, as a plugin does, and not own one. The owner's decision: the middleware takes a bus created beforehand.

## What Changes

- **BREAKING:** `createEffectsMiddleware(bus, options?)` takes the bus as its first argument and returns the middleware (a function to pass to `configureStore`), not `{ bus, middleware }`. It no longer creates a bus, so the bus options (`onError`, `trace`, `context`, ...) are given to `createBus` as for any bus.
- The middleware gives every task of that bus a `ctx.store` (`getState` and a `dispatch` that knows which task dispatches), as soon as Redux installs it. It does this through the `addContext` hook of the bus (the one `effectsPlugin` uses), chained to the previous hook, so it works with any other plugin on the same bus.
- The two guarantees stay: a handler does not loop on its own action, and a failing handler does not break `dispatch`. The second one no longer relies on a default `onError` of a bus the middleware made: when the bus has no `onError`, the middleware catches the error of `emit` and reports it with `console.error`; when the bus has `onError`, handlers are isolated by the bus as before.
- Options of the middleware: `filter` stays. `context` is removed (give fields to the bus with `createBus({ context })` or `contextPlugin`).
- Docs and examples follow: `docs/stores.md`, `docs/context.md`, `docs/package.md`, `examples/redux.ts`, `integration/redux.test.ts`, `scripts/smoke.mjs`, `AGENTS.md` (the sentence on the Redux adapter), `CHANGELOG.md` with a **BREAKING** entry and the migration line.

## Capabilities

### New Capabilities
- `redux-effects-middleware`: connect a Redux store to a bus that exists, with `ctx.store` on the tasks, no self-loop, and errors of handlers kept away from `dispatch`.

### Modified Capabilities

None. (There is no spec of the middleware yet; this one describes its behavior after the change.)

## Non-goals

- A change to `createBus`, `Bus` or any file of `src/core`. The `addContext` hook already exists.
- Keeping the old form (`createEffectsMiddleware()` that makes a bus) as an overload: it would keep the thing this change removes. The migration is one line in the changelog.
- Adapters for Zustand, MobX, Pinia or other stores.
- Typing of `ctx.store` through a plugin (`WithContext` on the event map stays the way to type it).

## Impact

- `src/store/redux/effects.ts` (about 40 lines change), `src/store/redux/index.ts` (the type `EffectsMiddlewareOptions` is smaller), tests in `src/store/redux/effects.test.ts`, `src/tests/exports.test.ts` if it lists the shape, `integration/redux.test.ts`, `integration/bundlers.test.ts`, `scripts/smoke.mjs`.
- Docs: `docs/stores.md` (Redux section and its type block), `docs/context.md`, `docs/package.md`, `examples/redux.ts`, `AGENTS.md`, `CHANGELOG.md`.
- Size: `nanoeffects/redux` gets a little smaller (it no longer imports `createBus`); `size-limit` is checked in the last task.
- Users of `createEffectsMiddleware` break: `effects.middleware` and `effects.bus` disappear.
