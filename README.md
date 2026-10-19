# nanoeffects

[![npm](https://img.shields.io/npm/v/nanoeffects)](https://www.npmjs.com/package/nanoeffects)
[![CI](https://github.com/nanoeffects/nanoeffects/actions/workflows/ci.yml/badge.svg)](https://github.com/nanoeffects/nanoeffects/actions/workflows/ci.yml)
[![size](https://img.shields.io/bundlephobia/minzip/nanoeffects)](https://bundlephobia.com/package/nanoeffects)
[![license](https://img.shields.io/npm/l/nanoeffects)](LICENSE)

A small typed event bus. Handlers are tasks with an `AbortSignal`, and policies (`latest`, `debounce`, `throttle`, `queue`) and effects (`retry`, `timeout`) are plain functions that go straight into `on`.

```ts
import { createBus } from "nanoeffects";

type Events = { greet: string };

const bus = createBus<Events>();

const unbind = bus.on("greet", (name) => console.log(`hello ${name}`));

bus.emit("greet", "Ada"); // hello Ada
unbind(); // `on` returns the unsubscribe function, as in nanoevents
```

`emit` takes the event as a string, as an object `{ type, payload }` (a Redux action fits as it is), or as a function with a `type`, a command that runs and returns its result:

```ts
bus.emit("greet", "Ada");
bus.emit({ type: "greet", payload: "Ada" });
bus.emit(double, 21); // a command: runs, returns 42
```

Then the same bus with a policy, no other change:

```ts
import { latest } from "nanoeffects/policies";

// a newer search aborts the older one
bus.on(
  "search",
  latest(async (query, ctx) => {
    const items = await api.search(query, { signal: ctx.signal });
    ctx.emit("results", items);
  }),
);
```

- **Tiny.** `createBus` is about 1.2 kB gzip; every other entry is bundled only when imported.
- **Cancellation first.** Aborting a task aborts its children and `ctx.on` subscriptions and drops its result.
- **One model** instead of `AbortController`, lodash `debounce`, `p-queue` and a hand-written retry.
- **Typed** commands, actions, jobs and modules; **traced** with Redux DevTools; the trace can be cut out of the build.
- **Checked** against lodash on random call sequences, and against known issues of RxJS, p-queue, p-retry and effector.

## Install

```bash
npm install nanoeffects
```

ESM only, no dependencies, types included.

## Entries

| Import                   | What is in it                                                                 |
| ------------------------ | ----------------------------------------------------------------------------- |
| `nanoeffects`            | `createBus`, the types                                                        |
| `nanoeffects/policies`   | `latest`, `leading`, `debounce`, `throttle`, `queue`                          |
| `nanoeffects/effects`    | `retry`, `timeout`, `poll`, `delay`, `take`, `all`, `allSettled`, `race`      |
| `nanoeffects/actions`    | `createAction`, `createCommand`, `createJob`, `createModule`, `modulePlugin` |
| `nanoeffects/redux`      | `createEffectsMiddleware`                                                     |
| `nanoeffects/observable` | `createObserve`: an event as an Observable (RxJS)                             |
| `nanoeffects/dev`        | `devPlugin`: warnings about listeners that pile up and messages about modules; a no-op in production |
| `nanoeffects/trace`      | `createTracer` and the loggers                                                |

## The task context

`bus.on(event, handler)` calls `handler(payload, ctx)`. Each call is a task:

| `ctx`             | Meaning                                                  |
| ----------------- | -------------------------------------------------------- |
| `signal`, `abort` | the signal of the task, and a way to abort it            |
| `emit`            | emit as this task; does nothing after an abort           |
| `on`, `off`       | subscribe; the subscription ends when the task aborts    |
| `run(fn, ...)`    | a child task, aborted with this one                      |
| `type`, `payload` | the event the task works on                              |

The event map (`type Events = { name: Payload }`) is optional: `createBus()` takes any string event with an `unknown` payload. `createAction("user/loaded")` takes its payload type from the map, and `createAction<User>("user/loaded")` gives it when there is none.

## Docs

[**Guide**](docs/guide.md) · [Policies](docs/policies.md) · [Effects](docs/effects.md) · [Actions, commands, modules](docs/actions.md) · [Context fields](docs/context.md) · [Errors](docs/errors.md) · [Tracing](docs/tracing.md) · [Redux, Zustand, MobX](docs/stores.md) · [Observable](docs/observable.md) · [Hot reload and dev diagnostics](docs/hmr.md) · [Semantics](docs/semantics.md) · [Examples](examples)

## Development

```bash
pnpm verify   # what CI runs: types, lint, tests, build, integration, package checks, size
```

[`AGENTS.md`](AGENTS.md) describes the structure and the rules of the code, for people and AI assistants.
