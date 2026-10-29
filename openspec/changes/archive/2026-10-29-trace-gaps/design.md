# Design

## Context

`tracePlugin` puts the function that makes the root of an emitter on the bus under `originKey`; `useEmitter` and `bus.emitter` read it each time and fall back to `bus.emit`. The Redux middleware (`src/store/redux/middleware.ts`) sends an action with `bus.emit` and `createEffectsMiddleware` builds on it (`effects.ts`). The decorators `@On(event, wrap?)` keep `{ event, wrap, once }` per method in a `WeakMap` and the class subscribes them through the `on` and `once` of the instance, which already pass extra arguments on (`subscribe` in `src/oop/subscriptions.ts`). `TRACE` in `src/core/flag.ts` reads `__NANOEFFECTS_TRACE__` when the module is loaded. See proposal.md for the motivation.

## Goals / Non-Goals

**Goals:**
- A named root for a Redux dispatch, a name for a decorated method, a test of the `notrace` build.
- The same off-switch as before: without `tracePlugin` or without a tracer, the options do nothing.

**Non-Goals:**
- A warning for `bus.emit` inside a handler, automatic names, a new export.

## Decisions

**The Redux middleware reads `originKey` as the emitters do.** The middleware looks up the function on the bus each time it sends an action and calls it with the action and `{ traceId, traceGroupId }`; when it is not there it calls `bus.emit`. The `onError` of the middleware still wraps the call. Without a `traceId` the root is named by the action type, as for `useEmitter`. The loop guard of `createEffectsMiddleware` (an action that a handler dispatched is not sent back) stays as it is. The code that finds the function and falls back is the same few lines as in `useEmitter` and `bus.emitter`; a shared helper in `src/core/origin-key.ts` would add code to every entry that imports it, and these are three lines, so each place keeps its own.

**Decorator options are the second or third argument.** `@On(event, wrap?, options?)`: when the second argument is an object and not a function it is the options, so `@On("ping", { traceId })` reads well, and `@On("ping", latest, { traceId })` keeps both. The record kept per method gets `options`, and the class passes it to the `on` or `once` of the instance as the third argument. Without `tracePlugin` the bus ignores it.

**The `notrace` test stubs the flag before a fresh import.** `TRACE` is read once when `src/core/flag.ts` loads, so the test sets `__NANOEFFECTS_TRACE__` to `false` with `vi.stubGlobal`, resets the modules, imports the bus and the plugin again, and checks that `emit`, `on`, `once` and `off` are the same functions after `bus.use(tracePlugin())` and that a handler with `{ traceId }` runs and the tracer sees nothing.

**Where the other places stand.** The `on` of a module, the instance methods of `extendBus` and `matchPlugin` already pass the options on (tested in `trace-plugin`); the spec now says so, so nobody removes it.

## Risks / Trade-offs

- [`@On("ping", someObject)` where the second argument was meant as a `wrap`] → a `wrap` is always a function, so an object is never taken for one; the type says so.
- [A Redux dispatch makes a root task for every action when `tracePlugin` is used] → only with a tracer and the plugin, and the tracer samples per root, so an unsampled root costs one `task` call.
- [The size of `redux` and `oop`] → measured; the lines are few.
