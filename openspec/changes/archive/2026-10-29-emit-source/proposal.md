# Proposal

## Why

`useEmitter` and `bus.emitter` put an event on the bus from outside any task: a render of a component, a callback of a state manager. In a trace such an event starts a chain with no sign of where it came from. A project has dozens of these subscriptions, and when one event leads to a chain of commands, policies and retries, the log does not say which subscription began it. Everything below the first link is already connected, because `ctx.emit` makes the causal parent; only the first link is anonymous.

A tree of parents also gives no name to a whole flow. Several roots (a click, a timer, a store callback) can belong to one business flow such as "checkout", and a reader of the log wants to filter by that flow, not to follow parent ids.

## What Changes

- `useEmitter` takes an options object as its third argument, `{ equals, traceId, traceGroupId }`, instead of the bare `equals` function. **BREAKING** (0.x): the old form `useEmitter(event, value, equals)` is dropped at once.
- `bus.emitter(creator, { traceId, traceGroupId })` takes an optional options object.
- `traceId` is a string that names the subscription that emits, such as the component or the store: `useEmitter(nameChanged, name, { traceId: "Profile" })`.
- When the bus has a tracer, the emit is made from a root task that is reported with the existing effect `"run"` (no new effect name); its `type` is the `traceId` (or the type of the event when there is none) and its payload is the action. Every task that the event starts is a child of it. Without a tracer, or in the `notrace` build, the event is emitted as it is today and nothing extra runs.
- `traceGroupId` names a flow. A command, a job or an action can carry it in its scope, `createCommand("checkout/pay", handler, { traceGroupId: "checkout" })`, and so can an emitter. Every task that a task with a `traceGroupId` starts, through `ctx.emit` and `ctx.run`, has the same `traceGroupId`, unless it sets its own. Trace events carry it as an optional `traceGroupId` field, and `consoleLogger` prints it. The tracer keeps and inherits it, so `createBus` is not touched.
- The field `parent` of a trace event is renamed `parentId`, to go with `rootId` and `traceGroupId`. **BREAKING** for a logger of your own that reads `event.parent`; the built-in loggers are updated.
- Trace events of a task below another one carry `rootId`, the id of the root task of the chain. A listener reports nothing, so the `parentId` of a command below a listener is the unreported listener; `rootId` links the command to the root whatever the hops. A root task has no `rootId`.
- `traceGroupId` is a reserved name in a scope: it is for the tracer and is not put on the task context. It works without `scopePlugin`.
- One small helper in `src/core` (not imported by `createBus`) makes the root task for both emitters, so they cannot differ.

Out of scope (deferred): the Redux middleware, the methods of `extendBus`, finding the component name or the call site automatically, a `traceId` or `traceGroupId` for a plain `bus.emit`, a `traceGroupId` in the options of a call to `emit`.

## Capabilities

### New Capabilities
- `emit-origin`: the root task of a trace that `useEmitter` and `bus.emitter` make, with the `traceId`.
- `trace-group`: the `traceGroupId` of a flow, where it is declared, how tasks inherit it and where the trace shows it.

### Modified Capabilities
- `react-entry`: the third argument of `useEmitter` is an options object with `equals`, `traceId` and `traceGroupId`.
- `action-emitter`: `bus.emitter` takes an options object with `traceId` and `traceGroupId`.
- `scope-context`: `traceGroupId` is a reserved key of a scope that is not put on the context.

## Impact

- New `src/core/origin.ts` (+ test); edits in `src/react/plugin.ts` and `src/actions/emitter.ts`; `src/trace/tracer.ts` (inherit and report `traceGroupId`), `src/trace/console.ts`; the `Tracer` and `TraceEvent` types; `src/scope/plugin.ts` (reserve the key); `src/actions/carry.ts` or the creators if a scope without a handler is needed; tests and type tests.
- Docs: `docs/stores.md`, `docs/plugins.md`, `docs/tracing.md` (sections on `traceId` and `traceGroupId`), `docs/scope.md` (the reserved key), `CHANGELOG.md`.
- `package.json` size limits of `react`, `actions` and `trace` may move a little; measure. `createBus` is untouched.
- The call `useEmitter(event, value, equals)` stops working: `equals` is a field of the object now.
