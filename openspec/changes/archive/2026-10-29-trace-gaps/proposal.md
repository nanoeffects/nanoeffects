# Proposal

## Why

`trace-plugin` named the roots of emitters and the listeners of `bus.on`, but four holes were left. A `dispatch` of Redux still starts an unnamed chain. The decorators `@On` and `@Once` cannot name a method. The `notrace` build is guarded in code but by no test. And the docs do not say that `bus.emit` inside a handler starts a new root while `ctx.emit` keeps the chain. This change closes them without touching `createBus`.

## What Changes

- The Redux middleware takes `{ traceId, traceGroupId }` in its options and, with `tracePlugin` and a tracer, sends each Redux action to the bus from a root task, named by the `traceId` or by the type of the action. Without the plugin the options are ignored.
- `@On(event, wrap?, options?)` and `@Once(event, wrap?, options?)` accept `{ traceId }`. The second argument may be the options when it is an object, so `@On("ping", { traceId: "pinger" })` works with no `wrap`.
- A test of the `notrace` build: with `__NANOEFFECTS_TRACE__` false, `tracePlugin` leaves the bus as it was and handlers with options behave as before.
- The module `on`, the instance `on` and `once` of `extendBus`, and `matchPlugin` pass `{ traceId }` on (the code already does; this change pins it in the spec).
- Docs: `docs/tracing.md` says that `bus.emit` inside a handler starts a new root with no parent, that `ctx.emit` keeps the chain, and lists where the options work (emitters, Redux, modules, classes).

Out of scope, with the reason: a warning for `bus.emit` inside a handler, because the bus has no notion of the handler that is running (`ctx.emit` sets the emitter only for its own call), so the call cannot be told from any other without a change in core; automatic component names.

## Capabilities

### New Capabilities

### Modified Capabilities
- `redux-effects-middleware`: the options `traceId` and `traceGroupId`.
- `class-bus`: the options of `@On` and `@Once`.
- `trace-plugin`: the options work where listeners are made for you, and the `notrace` build ignores them.

## Impact

- `src/store/redux/middleware.ts` and `effects.ts`, `src/oop/decorators.ts` (+ tests); the tests of `tracePlugin` for the `notrace` flag.
- Docs: `docs/tracing.md`, `docs/stores.md` (Redux section), `docs/oop.md`, `CHANGELOG.md`.
- `createBus` is not touched (1265 B); the size limits of `react` and `actions` stay; `oop` and `redux` may grow by a few bytes, measured.
