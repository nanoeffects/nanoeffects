# nanoeffects

A typed event bus where every handler is a **task**: it gets a context with an `AbortSignal`, and the policies that decide what happens when calls overlap (`latest`, `debounce`, `throttle`, `queue`, ...) are plain functions around the handler.

```ts
import { createBus } from "nanoeffects";
import { latest } from "nanoeffects/policies";
import { retry } from "nanoeffects/effects";

type Events = { search: string; results: Item[] };

const bus = createBus<Events>();

// a new search aborts the previous one; the request is retried and cancelled with the task
bus.on(
	"search",
	latest(async (query, ctx) => {
		const items = await retry(ctx, () => api.search(query, { signal: ctx.signal }));
		ctx.emit("results", items); // does nothing if this task was aborted meanwhile
	}),
);

bus.emit("search", "nano");
```

What it is for: the glue between events and async work in an app, where the usual answer is a pile of `AbortController`s, `debounce` from lodash, `p-queue` and a hand-written retry. Here they share one model of cancellation and one trace.

- **Tiny core.** `createBus` is about 1.2 kB gzip. Everything else is a separate entry and is bundled only when imported.
- **Cancellation is the base of everything.** Aborting a task aborts its children, ends its `ctx.on` subscriptions and drops its result.
- **Policies and effects are functions**: `latest`, `leading`, `debounce`, `throttle`, `queue`, `retry`, `timeout`, `poll`, `all`, `allSettled`, `race`, `take`.
- **Typed commands, actions, jobs and modules** to describe what the app does apart from the code that does it.
- **Tracing by design**: causal links between tasks, sampling, Redux DevTools, and a build that cuts all of it out.
- **Checked against the libraries it replaces**: `throttle` and `debounce` are compared with lodash on random call sequences, and known issues of lodash, RxJS, p-queue, p-retry, bottleneck and effector are regression tests.

## Install

```bash
npm install nanoeffects
```

ESM only, no dependencies. Types are included.

## Entries

| Import                  | What is in it                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------- |
| `nanoeffects`           | `createBus`, the types (`Bus`, `Context`, `WithContext`, ...)                          |
| `nanoeffects/policies`  | `latest`, `leading`, `debounce`, `throttle`, `queue`                                   |
| `nanoeffects/effects`   | `retry`, `timeout`, `poll`, `delay`, `take`, `all`, `allSettled`, `race`, `cancellable`, `onAbort` |
| `nanoeffects/actions`   | `createAction`, `createCommand`, `createJob`, `createModule`, `registerModules`        |
| `nanoeffects/redux`     | `createEffectsMiddleware`, `nanoeffectsMiddleware`: Redux actions to the bus, `ctx.store` in tasks |
| `nanoeffects/observable` | `createObserve`: an event of the bus as an Observable (RxJS and others)               |
| `nanoeffects/trace`     | `createTracer` and the loggers (Redux DevTools, console, performance)                  |

## Handlers and the task context

`bus.on(event, handler)` calls `handler(payload, ctx)` for every `bus.emit(event, payload)`. Each call is a task with its own context:

| `ctx`            | Meaning                                                                        |
| ---------------- | ------------------------------------------------------------------------------ |
| `signal`, `abort` | the abort signal of the task, and a way to abort it (and its children)         |
| `emit`           | emit as this task; does nothing after the task is aborted                      |
| `on`, `off`      | subscribe as this task; the subscription ends when the task aborts             |
| `run(fn, ...)`   | a child task: aborted with this one, its errors go to this one                 |
| `type`, `payload` | the event the task works on                                                    |

`emit` is a synchronous loop over the handlers, and `bus.on` returns the function that unsubscribes.

**The event map is optional.** Describe the events once, `type Events = { name: Payload }` (an event without data is `void`), and `createBus<Events>()` checks every `on` and `emit`. Or skip it: `createBus()` takes any string as an event and passes the payload as `unknown`. Actions and commands bring their own types, so they are typed on either kind of bus: `createAction("user/loaded")` needs no generics on a bus with an event map (the payload type comes from the map), and `createAction<User>("user/loaded")` gives it on a bus without one. On a bus with an event map, an action or a command that is emitted by its object must have its type in the map.

The event map is optional. Describe the events once, `type Events = { name: Payload }` (an event without data is `void`), and `createBus<Events>()` checks every `on` and `emit`. Or skip it: `createBus()` takes any string as an event and passes the payload as `unknown`. Actions and commands bring their own types, so they are typed on either kind of bus.

## Where to go next

- [Policies](docs/policies.md): `latest`, `leading`, `debounce`, `throttle`, `queue`, and `key` for a state per key.
- [Effects and cancellation](docs/effects.md): `retry`, `timeout`, `poll`, `take`, `all`, `race`, and `ctx.on`.
- [Actions, commands, jobs and modules](docs/actions.md): describe what an app does apart from the code that does it.
- [Your own fields in the context](docs/context.md): a store, a client or a logger in every task, with types.
- [Errors and unheard events](docs/errors.md): `onError` and `onUnhandled`.
- [Tracing](docs/tracing.md): causal traces, Redux DevTools, sampling, and a build without tracing.
- [Redux, Zustand, MobX](docs/stores.md).
- [Observable](docs/observable.md): events as streams for RxJS and others.
- [Hot reload](docs/hmr.md): modules are replaced by name, so an edit does not pile up handlers.
- [Semantics](docs/semantics.md): the rules that hold everywhere.
- [`examples/`](examples): code that is type-checked together with the project.

## Development

```bash
pnpm verify     # type check, lint, tests, build, integration tests, package checks, bundle size: what CI runs
pnpm test       # vitest
pnpm test:integration  # the real Redux Toolkit, Zustand, MobX, Jotai; Vite and webpack bundling the package
pnpm check      # biome with the readability plugins in lint/
```

[`AGENTS.md`](AGENTS.md) (also read by Claude Code through `CLAUDE.md`) describes the structure, the decisions behind it and the rules of the code, for people and for AI assistants that work on the project.
