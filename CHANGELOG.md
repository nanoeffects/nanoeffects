# Changelog

How to read an entry: **Breaking** needs a change in your code or setup, **Changed** is a different behavior that rarely breaks anything, **Added** is new. Details live in the linked docs, not here.

## Unreleased

## 0.22.0

### Added
- `take(ctx, event)` accepts an action creator as well as an event name, as `bus.on` does, and the result has its payload type: `await take(ctx, incrementCancelled)`. [Docs](docs/effects.md#wait-for-the-next-event-with-take)
- A counter example in the style of the redux-saga tutorial, in two pages: without a store, and with Redux Toolkit and `createEffectsMiddleware`. It shows a delayed increment under `latest`, a cancel with `race` and `take`, and a failing call under `retry`. [Example](examples/counter)
- `nanoeffects/svelte`: `sveltePlugin` adds `eventStore` (an event of the bus as a readable Svelte store) to a bus. The `svelte-ts` template uses it instead of its own helper file. [Docs](docs/svelte.md)

## 0.21.0

### Added
- `latest()`, `leading()`, `debounce(ms)`, `throttle(ms)` and `queue()` can be called without the function and return a wrapper, so `usePolicy(callback, debounce(300))` replaces `usePolicy(callback, (task) => debounce(300, task))` and there is no `task` to swap for your own callback. The old forms keep working. [Docs](docs/policies.md#call-a-policy-without-its-function)
- A trades example over a WebSocket: one command keeps the connection, opens it again after a drop and closes it on abort. [Example](examples/trades)
- A Rick and Morty example with React Query: the cache and the pages stay in React Query, the requests are commands with `timeout` and a `retry` that skips a 404. [Example](examples/rickandmorty)
- A spells example, the smallest one: a search against PotterAPI with one command that carries its handler and no domains. [Example](examples/spells)
- A pokédex example that calls PokeAPI from the browser: a search that does not race, a limit of time, a retry that knows an answer from a failure, and abilities that settle together. [Example](examples/pokedex)
- `npm create nanoeffects@latest my-app -- --template svelte-ts` makes the search app in Svelte 5 and TypeScript, with a Svelte store made from an event. [Docs](docs/starter.md#start-with-svelte)

## 0.20.0

### Changed
- The modules given to `modulePlugin([...])` are mounted at the end of the synchronous block that made the app, not only at the first use of the app or the bus, so an app that uses nothing at start still mounts them. Pass no modules and call `app.mount` to mount when you want. [Docs](docs/actions.md#mount-domains-with-modules)

### Added
- `nanoeffects/vue`: `vuePlugin` adds `watchEmitter` (emit when a ref changes) and `useEventRef` (the last payload of an event as a ref) to a bus. [Docs](docs/vue.md)
- `WithSignal`, the type of an object that has the `signal` of a task (`{ signal: AbortSignal }`), is exported from `nanoeffects`. [Docs](docs/typescript.md#type-a-function-that-takes-the-signal)
- `npm create nanoeffects@latest my-app -- --template vue-ts` makes the search app in Vue 3 and TypeScript, with `watchEmitter` and `useEventRef` from `nanoeffects/vue`. [Docs](docs/starter.md#start-with-vue)
- `app.mount(a, b, c)` and `app.unmount(a, b)` take any number of modules. They are mounted in order and undone in reverse order, and a call that fails leaves none of its modules mounted. [Docs](docs/actions.md#mount-domains-with-modules)
- A chat example with domains, modules and a small Fastify server that fails on a known schedule, and a page that explains it. [Docs](docs/chat-example.md)

## 0.19.1

### Changed
- The starter templates take `signal` and `emit` from the context of the handler (`async (query, { signal, emit }) => ...`) instead of using `ctx.signal` and `ctx.emit`. [Docs](docs/starter.md)

## 0.19.0

### Added
- `npm create nanoeffects@latest my-app -- --template domains-ts` makes a React and TypeScript project with the logic split into domains: commands, a job with a policy, and modules. [Docs](docs/starter.md#start-with-domains)

## 0.18.1

### Fixed
- `create-nanoeffects` writes `bin` without a leading `./`, so npm 11 keeps it in the published manifest and `npm create nanoeffects` finds the command.

## 0.18.0

### Added
- `npm create nanoeffects@latest my-app -- --template react-ts` (or `vanilla-ts`) makes the same app in TypeScript, with the types taken from the events. [Docs](docs/starter.md#choose-a-template)
- `bus.useEventState(event, initial)` is a React hook with the signature of `useState`: every emit of `event` sets the state to its payload. The state type comes from the event, or from `initial` when the event has no payload type. [Docs](docs/react.md#show-the-last-value-of-an-event-as-state)

## 0.17.0

### Added
- `npm create nanoeffects@latest my-app` makes a Vite project from the `vanilla` or `react` template. [Docs](docs/starter.md)

## 0.16.0

### Breaking
- The root `nanoeffects` entry exports `createBus` and the types a bus needs, and nothing more. Import the tracing types `Tracer`, `Trace`, `TraceEvent`, `TraceLogger`, `Phase` and `EffectName` from `nanoeffects/trace`, and `ContextTask` and `NoClash` from `nanoeffects/context`. `anyEventType` and `commandCall` were internal keys of the plugins and are gone. [Docs](docs/tracing.md#write-your-own-logger)

### Added
- The tracing types are exported from `nanoeffects/trace`, next to `createTracer` and the loggers. [Docs](docs/tracing.md#write-your-own-logger)

## 0.15.0

### Added
- `Emitter` in `nanoeffects/oop`: a base class to extend, `class VideoService extends Emitter<VideoEvents> {}`. Every instance is an independent emitter with `on`, `once`, `off`, `emit`, `dispose` and a bus of its own. [Docs](docs/oop.md#make-an-independent-emitter-with-emitter)
- `extendBus(bus)` without a class returns a class with the methods of that bus, to extend as it is: `class Service extends extendBus(bus) {}`. It used to throw. [Docs](docs/oop.md#extend-the-result-with-no-class-of-your-own)
- `Subject` in `nanoeffects/observable`: one event of a bus, or of an instance of a class from `extendBus`, as an Observable that also has `next`. It can be extended, and a `Subject` made over `this` ends with `dispose()`. [Docs](docs/observable.md#read-and-write-one-event-with-a-subject)

## 0.14.0

### Breaking
- `contextPlugin` moved to its own entry. Change `import { contextPlugin } from "nanoeffects"` to `import { contextPlugin } from "nanoeffects/context"`; `createBus` and the types `NoClash` and `ContextTask` stay in `nanoeffects`. [Docs](docs/context.md)

## 0.13.0

### Breaking
- `reduxDevtools`: the `start` and `done` actions no longer carry the payload by default. For the old output use `payload: "all"`.

### Added
- `reduxDevtools({ payload })` takes `"essential"` (default), `"all"` or `"none"`. `"essential"` sends the payload with the emits and with `cancel`, `drop` and `error`, where it says which call it was. `"none"` keeps payloads out of the extension. [Docs](docs/tracing.md#configure-redux-devtools)

## 0.12.0

### Breaking
- `reduxDevtools` is quiet by default: one action per emit, plus the failures of handlers. Tasks of handlers and policies are no longer sent. For the old output use `reduxDevtools({ policies: true, depth: 1 })`.
- The emit actions need `bus.use(tracePlugin())`. Without it the default log is empty, and the logger prints one `console.warn` that says so.

### Added
- `tracePlugin()` reports each emit as a trace event with `effect: "emit"`, also when nothing listens, for a command and for `ctx.emit`. `consoleLogger` and `performanceLogger` show it too. [Docs](docs/tracing.md#show-every-emit)
- `reduxDevtools({ policies })` adds the stages of the handler tasks as `event/policy/phase`. It takes `true`, a list of phases (`["cancel", "drop"]`) or a function of `{ effect, phase }`. The failure of a handler is always shown. [Docs](docs/tracing.md#configure-redux-devtools)

### Changed
- `reduxDevtools`: `depth` defaults to `0`. Effects below a handler (`retry`, `timeout`) need `depth: 1`.

## 0.11.0

### Breaking
- `useEmitter(event, value, options)` takes an options object as the third argument. A function there (the old `equals`) is ignored: use `{ equals }`.
- The field `parent` of a trace event is now `parentId`. A logger of your own that reads `event.parent` must read `parentId`.
- The `type` of the root task of an emitter is its `traceId`, so a `sample` function of `createTracer` that matches the event type does not pick it.
- `traceGroupId` is a reserved name in a scope. It is never put on `ctx`.

### Added
- `bus.use(tracePlugin())` names and groups what a trace shows. Without it, or without a tracer, all of its options are ignored and nothing else changes, so it can be used only in development. [Docs](docs/tracing.md#show-which-subscription-began-a-chain)
  - `traceGroupId` in the scope of a command, job or action (or in the options of an emitter) puts every task below it in one flow. A nearer group wins. [Docs](docs/tracing.md#follow-one-flow-with-a-tracegroupid)
  - `useEmitter(…, { traceId })` and `bus.emitter(…, { traceId })` emit from a named root, so a chain says which subscription began it.
  - `bus.on(event, handler, { traceId })` and `bus.once` name a listener. The same option works for `@On` / `@Once`, in modules, with `extendBus`, and for the dispatches of `createEffectsMiddleware`. [Docs](docs/tracing.md#name-a-listener)
- Trace events of a task below another one have `rootId`, the id of the root of the chain.

## 0.10.0

### Changed
- The outcomes of `createJob` follow the policies (`latest`, `leading`, `debounce`, `throttle`, `queue`). **Behavior change:**
  - `pending` is sent when the handler starts, not when the call is made.
  - A call that a policy drops or replaces while it waits sends nothing.
  - A run that `latest` replaces sends `cancel` (it closed with `success(undefined)` before), ahead of the `pending` of the new call.
  - Every `pending` gets exactly one of `success`, `fail` or `cancel`, and none is sent without `pending`.
  - A job without a policy, or with a policy hidden in your own function, is unchanged.

## 0.9.0

### Added
- `withPolicy(task)` makes a policy a plain function with no bus and no context, with `cancel()` to abort pending calls. `usePolicy(callback, make, deps?)` holds one in a React component. [Docs](docs/policies.md), [React](docs/react.md)
- `bus.use(signalPlugin())` lets `bus.emit(call, { signal })` tie the tasks of an emit to an outside `AbortSignal`, so the abort of React Query reaches the handler, `latest`, `retry` and `timeout`. [Docs](docs/query-libraries.md)
- `createJob` sends two more outcomes: `job.pending(payload)` when the handler starts and `job.cancel(reason)` when the task is aborted. After `pending`, exactly one of `success`, `fail` and `cancel` follows. [Docs](docs/actions.md)
- Guides for finding the library: [cancel stale requests](docs/cancel-stale-requests.md), [migrating from mitt](docs/migrating-from-mitt.md), and `skills/nanoeffects/SKILL.md` for AI assistants.

### Changed
- `onUnhandled` is also called for a `pending` or `cancel` that nobody listens to. An aborted task sends `cancel` where it sent nothing.
- `scopePlugin` passes the second argument of `emit` on for an action or a call too, so a plugin that wraps `emit` after it sees the options.

## 0.8.0

### Added
- `nanoeffects/oop`: `extendBus(bus, Base)`, `@WithBus`, `@On` and `@Once` put the methods of a bus on a class, with `dispose()` for the subscriptions of an instance. [Docs](docs/oop.md)
- `bus.use(matchPlugin())` lets `on`, `once` and `off` take a function that picks the events: `bus.on((action) => action.type.startsWith("user/"), handler)`. [Docs](docs/plugins.md)
- [Plugins](docs/plugins.md) are on one page, from the common ones to the rare ones. The examples in `docs/` keep the bus, the events and the handlers in separate files.

### Changed
- Plugins work in any order. **Behavior change:**
  - `modulePlugin([modules])` mounts the modules on the first use of the app or the first `bus.emit`, not inside `bus.use`. Plugins used after it now reach the modules. The app is also `bus.app`.
  - A second `commandsPlugin` on a bus that has a registry binds into that registry and returns it, instead of replacing it.
- `effectsPlugin` does not assign an effect over a field that is already on `ctx`, so a scope wins whichever plugin came first.
- `devPlugin()` finds the app that `modulePlugin` put on the bus, whichever was used first.

## 0.7.0

### Breaking
- The key of a scope that holds the bound functions is `$effects`, not `effects`: `createCommand("user/get", handler, { api, $effects: { race } })`. A key named `effects` is now an ordinary field of `ctx`. Rename it in every scope (`createCommand`, `createAction`, `createModule`, `createJob` and the second argument of `emit`). An old scope raises no error: nothing in its `effects` is bound.

### Changed
- `createJob`: when the `success` or `fail` action has a scope of its own, its listeners see the job's fields with the action's own over them. Before, the job's scope replaced it.
- `scopePlugin` does less work for each task that has a scope.

### Added
- [Plugins](docs/plugins.md) on one page: what each adds, what `bus.use` returns, and the order that matters.

## 0.6.0

### Added
- `bus.use(scopePlugin())` lets a command, job, action or module carry its own `ctx` fields, and lets one `emit` replace them: `createCommand("user/get", handler, { api })`, `bus.emit(getUser("1"), { api: fakeApi })`. Handlers see the fields typed. Without the plugin a scope is ignored. [Docs](docs/scope.md)
- `effect(fn)` and `Effect<F>` keep the type parameters of a generic user effect.
- `docs/guide.md`: how `bus.on("*", fn)` works.

### Changed
- `effectsPlugin` accepts any function whose first parameter is `{ signal }`, not only the built-in five.

## 0.5.0

### Breaking
- `createEffectsMiddleware(bus, options?)` takes a bus that you made and returns the middleware, not `{ bus, middleware }`. `onError`, `trace` and `context` go to `createBus`; the only option left is `filter`. Migrate: `const effects = createEffectsMiddleware(); effects.bus.on(…)` becomes `const bus = createBus(); const middleware = createEffectsMiddleware(bus); bus.on(…)`.
- The `context` field of `Bus`, the slot that plugins read, is renamed `ctx`. `createBus({ context })` is unchanged.

### Added
- `nanoeffects/react`: `reactPlugin()` adds the hook `bus.useEmitter(event, value)`, which emits after a render commits with a changed value. [Docs](docs/stores.md)
- `contextPlugin(fields)` puts fields on every task and types `ctx` from the value, with no `WithContext`.
- `app.createModule(name, setup)` and the type `EventsOf<typeof bus>` type the `ctx` of modules and handlers in other files. [Docs](docs/typescript.md)
- `effectsPlugin({ race, all, … })` puts the effects on every task context, bound to the task.
- `emitterPlugin()` adds `bus.emitter(action)`, a callback for the subscription of a state manager. [Docs](docs/stores.md)
- `backoff({ base, factor, max, jitter })` builds the `delay` of `retry` and `poll`. `take` accepts a type guard as `predicate`.
- Guides: [React forms](docs/react.md), [stores](docs/stores.md), and migrating from [Effector](docs/migrating-from-effector.md), [redux-saga](docs/migrating-from-saga.md) and [RxJS](docs/migrating-from-rxjs.md).
- StackBlitz playgrounds (`examples/playground`, `playground-react`, `playground-devtools`), `llms.txt` and `llms-full.txt` for AI assistants, and `pnpm docs:check`, which type-checks the code blocks of `docs/`.

## 0.4.0

### Breaking
- Calling a command or job, `command(payload)`, builds `{ type, payload }` like `createAction` and no longer runs the handler. Use `bus.emit(command(payload))`.

### Added
- `bus.once(event, fn)`. `bus.off()` with no arguments clears every listener.

### Changed
- Removing listeners no longer slows down as their number grows: unsubscribing 50 000 listeners took seconds and now takes milliseconds.

## 0.3.0

### Breaking
- `createJob` returns the command itself, with the outcome creators as properties `job.success` and `job.fail`. `{ command, successAction, failAction }` is gone.
- `createCommands(bus, bindings?)` is replaced by `bus.use(commandsPlugin(bindings?))`.

### Added
- A command has `match(action)`, as an action creator has.

## 0.2.1

### Breaking
- `nanoeffectsMiddleware` is no longer exported from `nanoeffects/redux`. `createEffectsMiddleware` is the one entry.

## 0.2.0

### Breaking
- `registerModules(bus, modules)` is replaced by `bus.use(modulePlugin(modules))`.
- `createJob(type, handler, { success, fail })` returns `{ command, successAction, failAction }`. The option `done` is now `success`.
- `createBus` has no `commands` option: `createCommands(bus, bindings?)` attaches the registry.

### Added
- `m.use(...)` in a module brings commands that carry a handler. `retry`, `timeout` and `poll` also wrap a Task.
- `nanoeffects/dev`: `bus.use(devPlugin({ app }))` warns about listeners that pile up. It is a no-op in production.
- `reduxDevtools` is quiet by default: a task is one action, when it ends.

## 0.1.0

First release.

- `createBus`: a typed event bus where each handler is a task with a context (`signal`, `emit`, `on`, `run`).
- Policies: `latest`, `leading`, `debounce`, `throttle`, `queue`. Effects: `retry`, `timeout`, `poll`, `take`, `all`, `race` and others.
- Actions, commands, jobs and modules; tracing with Redux DevTools, console and performance loggers; the Redux adapter.
