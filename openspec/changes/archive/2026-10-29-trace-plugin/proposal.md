# Proposal

## Why

The change `emit-source` added `traceId`, `traceGroupId` and `rootId` to the trace. It works, but it put more than the trace into the wrong places: the emitted call is passed through `createBus`, `createTask` and `Tracer.task` so the tracer can read a scope (about 20 bytes of a bus that has 8 to spare, found by shortening `store.clear`), and the code that makes the root of an emitter is bundled into `react` and `actions` (+0.16 kB and +0.12 kB). A project that does not trace pays for it, and a project that turns the option off in production has nothing it can drop. A listener cannot be named at all, so a trace shows what started a chain and what it started, but not which listener ran in between.

## What Changes

- Add `tracePlugin` to `nanoeffects/trace`. It is the one place for `traceGroupId`, `traceId` and the name of a listener.
- `traceGroupId` of a call (the scope of a command, a job, an action) is read by the plugin: it makes the call known to the tracer for the synchronous time of an emit. The tracer reads it where it makes a task. The `call` that was passed through `bus.emit`, `createTask` and `Tracer.task` is removed from core, and so is the reading of `scopeKey` in `createTracer`.
- The root task of `useEmitter` and `bus.emitter` is made by a function that `tracePlugin` puts on the bus under a shared key. `reactPlugin` and `emitterPlugin` read it each time they emit and call `bus.emit` when it is absent. The code for the root leaves the bundles of `react` and `actions`; their size limit of `actions` goes back to 2.87 kB, and the one of `react` to 1.18 kB.
- `bus.on` and `bus.once` take an optional third argument, `{ traceId }`. With the plugin and a tracer, each call of that listener is a task named by the `traceId` (effect `run`), and what it emits is below it, so a trace says which listener ran. `bus.off` keeps working.
- **Hard requirement: nothing breaks when this is off.** Without the plugin, without a tracer, or in the `notrace` build, the options are ignored and handlers, results, throws, rejections and `onError` are as before. The types of the options are in the types of the bus, so they are the same with and without the plugin and a conditional `bus.use(tracePlugin())` compiles either way. `traceGroupId` stays a reserved scope key that never reaches `ctx`.
- **BREAKING** (not yet released): `traceGroupId` of a scope and `traceId` of an emitter need `bus.use(tracePlugin())`; without it they are ignored. `emit-source` is not released.

Out of scope: the Redux middleware, the methods of `extendBus`, finding names automatically, a `production` export build of `nanoeffects/trace` (it would also turn off the loggers that the docs use in production, and the plugin does nothing without a tracer already).

## Capabilities

### New Capabilities
- `trace-plugin`: the plugin, the named listener, and the guarantees when it is off.

### Modified Capabilities
- `emit-origin`: the root of an emitter needs `tracePlugin`, and is made by a function the plugin puts on the bus.
- `trace-group`: the scope `traceGroupId` is read by the plugin, and `Tracer.task` keeps its signature.
- `react-entry`: `traceId` and `traceGroupId` of `useEmitter` need the plugin.
- `action-emitter`: the same for `bus.emitter`.

## Impact

- `src/core/bus.ts`, `src/core/context.ts`, `src/core/tracer.ts`: remove `call`; `src/core/types.ts` and `bus.ts`: the options in the type of `on` and `once`; a new key file in `src/core` for the shared key and the call that is being emitted.
- `src/core/origin.ts` moves to `src/trace`; new `src/trace/plugin.ts` (+ tests); `src/trace/tracer.ts` reads the call; `src/react/plugin.ts` and `src/actions/emitter.ts` read the key.
- `src/tests/plugin-matrix.test.ts`: an installer and probes; `package.json` size limits of `react` and `actions` go back, `trace` may grow.
- Docs: `docs/tracing.md` (the plugin, the named listener), `docs/plugins.md` (a row), `docs/stores.md`, `docs/package.md`, `llms.txt`, `CHANGELOG.md`.
