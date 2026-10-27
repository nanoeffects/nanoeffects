# Changelog

## Unreleased

- `nanoeffects/signal`: `bus.use(signalPlugin())` lets `bus.emit(call, { signal })` tie the tasks that the emit starts to an outside `AbortSignal`, with its reason, so the abort of React Query (`queryFn: ({ signal }) => bus.emit(getUser(id), { signal })`) reaches the handler, `latest`, `retry` and `timeout`. It takes the call forms (a command, a job, an action) and returns what `emit` returns. `{ signal }` can share the object with a scope (`scopePlugin` never put `signal` on `ctx`). For a command or a job the link ends when its promise settles, for an event it stays until the signal aborts. `createBus` is not changed; the entry is about 0.57 kB brotli. Docs: "Use nanoeffects with React Query and SWR" (`docs/query-libraries.md`). `scopePlugin` now hands the second argument of `emit` on to the next `emit` also for an action or a call, so a plugin that wraps `emit` after it sees the options.
- `createJob` sends two more outcomes: `job.pending(payload)` when the handler starts, and `job.cancel(reason)` when the task is aborted before the handler settles, instead of `success` or `fail`. After `pending`, exactly one of `success`, `fail`, `cancel` follows. Both are options like `success` and `fail` (a string, a creator, or the default `<type>/pending` and `<type>/cancel`) and are properties of the job. Jobs that give only `success` and `fail` run as before, with two differences: the new actions are events, so `onUnhandled` is also called for a `pending` or `cancel` that nobody listens to; and an aborted task sends `cancel` where it sent nothing. A job without a handler sends nothing. Policies (`latest`, `leading`, `throttle`, `queue`) are not known to the job: `pending` is sent for every call and a dropped or replaced call closes with `success(undefined)`; making policies exact is a follow-up. Docs: "Show a loading state with a job" in `docs/actions.md`.
- `createBus` is the same size (1293 bytes brotli, limit 1.3 kB): the task context lets `createJob` send `cancel` after an abort through a symbol key, and the room for it came from the description of the `commandCall` symbol. `nanoeffects/actions` grows by about 90 bytes brotli for the two outcomes (its limit is now 2.7 kB).
- Docs for finding the library: `docs/cancel-stale-requests.md` (a recipe for race conditions) and `docs/migrating-from-mitt.md`. The package ships `skills/nanoeffects/SKILL.md`, a skill for AI assistants that says when to suggest nanoeffects. The description and keywords of the package name the problems it solves.

## 0.8.0

- `nanoeffects/oop`: the methods of a bus on a class. `extendBus(bus, Base)` returns a subclass whose instances have `on`, `once`, `off`, `emit`, the methods of the plugins used before the call, and `dispose()` (also `Symbol.dispose`), which removes the subscriptions made through `this.on` and `this.once` of that instance and nothing else. `extendBus(Base)` makes a bus for the class (`Class.bus`). The class of the user wins a clash of names, and `disposeBus(this)` ends the subscriptions from a `dispose` of your own. `@WithBus(bus?)` is the same as a class decorator, `@On(event, wrap?)` and `@Once(event, wrap?)` make a method a handler of an instance with `this` bound, and `wrap` takes the bound handler (`@On(queryChanged, latest)`). Both kinds of decorators work. `createBus` is the same size; the entry is about 1 kB brotli of its own plus `createBus` for the form without a bus. `docs/oop.md`.
- Plugins work in any order, and `docs/plugins.md` no longer has a section of rules to follow. Four things changed for that:
  - **Behavior change:** `modulePlugin([modules])` mounts the modules on the first use of the app or of the bus (the first `bus.emit`, or a call of `mount`, `unmount`, `isMounted`, `dispose`, or the read of `commands`), not inside `bus.use`. The plugins used after it now reach the modules and the tasks they spawn, and `m.on(fn, handler)` works with `matchPlugin` in any order. The `on`, `once` and `off` calls made between `bus.use(modulePlugin(...))` and that first use are held and made right after the modules, in the order called, so the listeners of a module stay ahead of them as before. The app is also `bus.app`.
  - `createBus` is the same size; `nanoeffects/actions` grows by about 0.5 kB brotli (the lazy start and the held `on`, `once` and `off`).
  - **Behavior change:** a second `commandsPlugin` on a bus that has a registry binds its list in that registry and returns it, instead of replacing it. A custom `bus.commands = { run }` is replaced as before.
  - `effectsPlugin` does not assign an effect over a field that is on `ctx` already, so a scope wins whichever of `scopePlugin` and `effectsPlugin` came first.
  - `devPlugin()` finds the app that `modulePlugin` put on the bus (`bus.app`), whichever of the two was used first. `devPlugin({ app })` still works.
- `nanoeffects/match`: `bus.use(matchPlugin())` lets `on`, `once` and `off` take a function as the first argument, to subscribe to the events it picks: `bus.on((action) => action.type.startsWith("user/"), (payload, ctx) => …)`. The function gets `{ type, payload }` of every event; a type guard narrows the payload of the handler. An action creator or a command keeps its meaning. `ctx.on` takes such a function at run time (its type does not know it yet). The subscription listens to `"*"`, so each event makes one task for each such subscription, also when the function says no, and the events it listens to count as heard for `onUnhandled`. `createBus` does not change. The Guide has a section, and `docs/plugins.md` lists the plugin.
- `devPlugin` counts a function that picks events under `"*"` instead of `undefined`, and its `disconnect` no longer removes a wrapper that another plugin put on `bus.on` after it, so `devPlugin` and `matchPlugin` work in any order.
- `src/tests/plugin-matrix.test.ts` puts every plugin on a bus in every order of two and in 300 orders of all nine, and checks what each one does. It found the traps that the first item above removes: a module saw the fields of a plugin only if `modulePlugin` came after it, and `commandsPlugin` used after `modulePlugin` replaced the registry that the modules bound their handlers in.
- `docs/plugins.md` lists the plugins from the ones most apps use to the ones a few need, and gives each a job, a small example and what `bus.use` returns. Writing your own plugin moves to the end.
- The examples in `docs/` keep the bus, the events and the handlers in separate files, and `pnpm docs:check` keeps the files of each `##` section apart.

## 0.7.0

- **BREAKING:** the key of a scope that holds the bound functions is `$effects`, not `effects`: `createCommand("user/get", handler, { api, $effects: { race } })`. A key named `effects` is now an ordinary field of the context. Migrate: rename `effects` to `$effects` in every scope (`createCommand`, `createAction`, `createModule`, `createJob` and the second argument of `emit`). A scope that is not renamed raises no error: its `effects` object goes on `ctx` as a plain field and nothing in it is bound, so a function you call from `ctx` is missing. `effectsPlugin`, `effect(fn)` and the types are unchanged.
- `createJob`: when the `success` or `fail` action has a scope of its own, its listeners see the job's fields with the action's own fields over them (fields and `effects` merged one level deep). Before, the job's scope replaced the action's. The handler of the job is not affected.
- `scopePlugin` does less work for each task that has a scope: a command with a scope of three fields costs 1.8 times a command without one (it was 2.4), and an action with a scope 1.3 times (it was 1.9). Without the plugin the bus is unchanged.
- `docs/plugins.md`: every plugin of a bus on one page, what each adds, what `bus.use` returns, and the order that matters.

## 0.6.0

- `nanoeffects/scope`: `bus.use(scopePlugin())` lets a command, job, action or module carry its own context fields, and lets one `emit` replace them. A scope is a plain object: every key goes on `ctx` as it is, except `effects`, whose functions (each takes `{ signal }` first) are bound to the task like `effectsPlugin` does. It is given as the last argument of `createCommand`, `createAction`, `createModule` (and `app.createModule`) and `createJob` (after its outcomes), and as the second argument of `emit` / `ctx.emit` for an action or a command call: `createCommand("user/get", handler, { api, effects: { race } })`, `bus.emit(getUser("1"), { api: fakeApi })`. Strongest first: `emit`, action / command / job, module, bus; the fields of the library are never replaced and children inherit. Handlers see the fields typed, with no `WithContext`. Without `scopePlugin` a scope is ignored, and `createBus` is byte for byte the same (`nanoeffects/actions` grows by about 230 B brotli). Use `scopePlugin` after `effectsPlugin` and before `modulePlugin`. `docs/scope.md`, `examples/scope.ts`.
- `effect(fn)` and the type `Effect<F>` from `nanoeffects/scope` keep the type parameters of a generic user effect, which a plain function in `effects` loses (`<T>(items: T[]) => T` becomes `(items: unknown[]) => unknown`); `effect(fn)` is a value of the scope like any other.
- `effectsPlugin` accepts any function whose first parameter is `{ signal }`, not only `race`, `all`, `allSettled`, `take` and `delay`; a function that does not take a signal first is a type error. The built-in five keep their types.
- Types: `ActionCreator` and `FreeActionCreator` have a fourth and second type parameter for the fields of a scope; `Emit` takes a scope on the call forms, `On` types the listeners of an action or command with a scope. Code that does not use scopes is typed as before.
- `docs/guide.md`: "Listen to every event", how `bus.on("*", fn)` works: the payload and the task context, `ctx.type` as the event name, and its place in `onUnhandled` and `bus.off`.

## 0.5.0

- A React playground on StackBlitz (`examples/playground-react`): the same search in a component, with the bus outside React and its tasks printed to the browser console. A separate `examples/playground-devtools` sends the tasks to Redux DevTools. `examples/README.md` indexes the playgrounds and recipes.
- `nanoeffects/react`: `reactPlugin()` adds `bus.useEmitter(event, value, equals?)`, a React hook that emits `event` with `value` after a render commits with a changed value (`Object.is`, or your `equals`). It does not emit on mount or twice under StrictMode, and `export const { useEmitter } = bus` gives a free hook. `react` (>=18) is an optional peer dependency; no other entry imports it. `docs/stores.md` gets "React: sharing a value across components": a Context provider with `useEmitter`, a small `useSyncExternalStore` value that handlers can read through `ctx`, a Nanostores atom, and why not to emit inside a `useReducer` reducer.
- `docs/migrating-from-effector.md`: "Keep the state in Zustand", the search with a Zustand store in place of `$items`.
- `docs/migrating-from-effector.md`: "Rewrite a form", the form of the Effector Forms recipe next to its nanoeffects version (React state instead of `$form`, a handler instead of `sendFormFx`, the values in the event instead of `sample`), with three more rows in the equivalence table.
- **BREAKING:** `createEffectsMiddleware(bus, options?)` takes a bus that you made and returns the middleware itself, not `{ bus, middleware }`. It no longer creates a bus, so `onError`, `trace` and `context` go to `createBus`; the only option left is `filter`. `ctx.store` is put on the tasks through `bus.addContext`, so it works next to `effectsPlugin` and `contextPlugin`. A handler error still does not break `dispatch`: the bus's `onError` takes it, or `console.error` when the bus has none. Migrate: `const effects = createEffectsMiddleware<Events>(); effects.bus.on(...)` becomes `const bus = createBus<Events>(); const middleware = createEffectsMiddleware(bus); bus.on(...)`.
- `docs/react.md`: a sign-up form in React. A username check with `debounce` and `latest`, a submit that a second click cannot repeat (`leading`), `retry` for network errors only, and how to cancel work when the component unmounts. The wiring is tested in `examples/registration-form.ts`.
- `docs/stores.md`: one search-box example for every store (Nanostores, MobX, Valtio, Jotai, Zustand, and the new Pinia), each in its own subsection with both directions: a change of the store starts a debounced search, and the result of the search is written back to the store. A table of contents is at the top.
- `pnpm docs:check` also checks `jsx` and `tsx` blocks, and a block can name its file (`// name-bus.js`) so another block imports it.
- `llms.txt` and `llms-full.txt` in the package, for AI assistants: an index with the rules that generated code often gets wrong, and the whole documentation in one file. `pnpm llms:check` fails when a page of `docs/` is missing from the index.
- `contextPlugin(fields)` from `nanoeffects`: `bus.use(contextPlugin({ store }))` puts `store` on every task and types `ctx.store` from the value, so the event map needs no `WithContext` (`type Events = { "user/loaded": User }` is enough). A function `(task) => fields` makes the fields per task. Several uses merge with each other, with `effectsPlugin` and with the `context` option; a repeated name is a type error. `createBus` and `WithContext` are unchanged.
- `app.createModule(name, setup)` on the object that `bus.use(modulePlugin())` returns: `createModule` with the event map of the bus fixed, so a module in its own file sees `ctx.store` and the effects of the plugins without `createModule<AppEvents>`. It returns a plain module, not mounted. `createModule` of `nanoeffects/actions` is unchanged.
- `EventsOf<typeof bus>` (type only): the event map of a bus with the context fields that `WithContext` and the plugins added, so handlers, commands and modules in other files can type their `ctx`. `docs/typescript.md`, `examples/typescript` and `examples/typescript-context` show the setup.
- `take` accepts a type guard as `predicate`: `take(ctx, "loaded", { predicate: isAdmin })` resolves with the narrowed type.
- `docs/migrating-from-saga.md`: the names of redux-saga (`call`, `fork`, `spawn`, `takeLatest`, channels) and what they are here, and what has no equivalent.
- `docs/migrating-from-rxjs.md` (how the work is split with RxJS, operators and policies side by side) and `docs/migrating-from-effector.md` (names, a rewritten effect, running both).
- A playground on StackBlitz (`examples/playground`): the search example with `debounce` and `latest` and a log of started, aborted and finished requests. README links to it.
- `pnpm docs:check` type-checks the `js` and `ts` code blocks of `docs/` against the sources, so a stale snippet fails `verify` and CI. Fixes for the snippets it found are in `docs/effects.md` and `docs/guide.md`.
- `backoff({ base, factor, max, jitter })` from `nanoeffects/effects`: builds the `delay` of `retry` (or `poll`): `base * factor ** (attempt - 1)`, at most `max`, with optional full jitter. `docs/effects.md` gets a "Back off between retries" recipe.
- **BREAKING:** the `context` field of `Bus`, the slot that plugins read, is renamed to `ctx`. `createBus({ context })` is unchanged. It saves bytes in the bundle, which does not shorten property names.
- `emitterPlugin()` from `nanoeffects/actions`: `bus.use(emitterPlugin())` adds `bus.emitter(action)`, a callback `(...args) => bus.emit(action(...args))` to pass to the subscription of a state manager (`$name.listen(bus.emitter(nameChanged))`). `createAction` and `bus.emit` are unchanged. `docs/stores.md` shows Nanostores, MobX, Valtio, Jotai and Zustand.
- `effectsPlugin({ race, all, … })` from `nanoeffects/effects`: puts `race`, `all`, `allSettled`, `take` and `delay` on every task context, bound to the task, so a handler can write `(id, { race })`. `bus.use(effectsPlugin(…))` returns the same bus typed with those fields. It uses the new `Bus.addContext` hook.

## 0.4.0

- `bus.once(event, fn)`: subscribe for one emit; the handler is removed before it runs. Returns an unsubscribe function.
- `bus.off()` with no arguments clears every listener of every event (including `"*"`). `off(event)` / `off(event, fn)` are unchanged. `ctx.off` is the same API.
- **BREAKING:** Calling a command or job, `command(payload)`, builds `{ type, payload }` like `createAction` and no longer runs the handler. Use `bus.emit(command(payload))` (or still `bus.emit(command, payload)`) for the result.
- Removing listeners no longer slows down as their number grows: unsubscribing 50 000 listeners in the order they were added took seconds and now takes milliseconds.

## 0.3.0

- **BREAKING:** `createJob` returns the command itself, with the action creators of its outcome as properties, `job.success` and `job.fail`; `{ command, successAction, failAction }` is gone. Options, defaults and routing are unchanged.
- **BREAKING:** `createCommands(bus, bindings?)` is replaced by `bus.use(commandsPlugin(bindings?))`, the same form as `modulePlugin` and `devPlugin`; the registry it returns is unchanged.
- A command has `match(action)`, as an action creator has: it tells whether an action has the type of the command and narrows its type.

## 0.2.1

- **BREAKING:** `nanoeffectsMiddleware` is no longer exported from `nanoeffects/redux`; `createEffectsMiddleware` is the one entry, and its `bus` takes modules, tracing and the rest (`effects.bus.use(...)`).

## 0.2.0

- **BREAKING:** `registerModules(bus, modules)` is replaced by `bus.use(modulePlugin(modules))`; `bus.use(plugin)` calls a plugin, a function of the bus, and returns what it returns.
- **BREAKING:** `createJob(type, handler, { success, fail })` returns `{ command, successAction, failAction }`; a string makes the action creator (a missing one gets `<type>/success` or `<type>/fail`), a creator that was given is returned as it is, and an error of the handler is always handled. The option `done` is now `success`, and a command or a plain action is no longer a target.
- **BREAKING:** `createBus` has no `commands` option: `createCommands(bus, bindings?)` attaches the registry to a bus and returns it.
- `m.use(...)` in a module brings commands that carry a handler as well as sub-modules.
- `retry`, `timeout` and `poll` also wrap a Task, so they go into `on(...)` with the policies and run with `ctx.run(...)`.
- `nanoeffects/dev`: `bus.use(devPlugin({ app }))` warns about listeners that pile up and reports modules that are mounted, replaced and unmounted. In a production build it is a no-op (the `production` export condition).
- `reduxDevtools` is quiet by default: a task is one action, when it ends (`starts`, `depth`, `maxAge` to change that).

## 0.1.0

First release.

- `createBus`: typed event bus; each handler is a task with a context (`signal`, `abort`, `emit`, `on`, `off`, `run`).
- Policies (`nanoeffects/policies`): `latest`, `leading`, `debounce`, `throttle` (lodash-compatible), `queue`, `key` option.
- Effects (`nanoeffects/effects`): `retry`, `timeout`, `poll`, `delay`, `take`, `all`, `allSettled`, `race`, `cancellable`, `onAbort`. `retry`, `timeout` and `poll` also wrap a Task, `retry(task, options)`, `timeout(ms, task)`, `poll(ms, task, options)`, so they go into `on(...)` with the policies and run with `ctx.run(...)`; the `ctx`-first calls are unchanged.
- Actions, commands, jobs and modules (`nanoeffects/actions`). The registry of command handlers is attached to a bus with `createCommands(bus)`; in a module `m.use(...)` brings sub-modules and commands that carry a handler, and `m.handle` gives an explicit handler.
- Tracing (`nanoeffects/trace`) with Redux DevTools, console and performance loggers, and the `notrace` build.
- Redux adapter (`nanoeffects/redux`): `createEffectsMiddleware`.
