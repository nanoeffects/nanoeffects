# nanoeffects

[![npm](https://img.shields.io/npm/v/nanoeffects)](https://www.npmjs.com/package/nanoeffects)
[![CI](https://github.com/nanoeffects/nanoeffects/actions/workflows/ci.yml/badge.svg)](https://github.com/nanoeffects/nanoeffects/actions/workflows/ci.yml)
[![size](https://img.shields.io/bundlephobia/minzip/nanoeffects)](https://bundlephobia.com/package/nanoeffects)
[![license](https://img.shields.io/npm/l/nanoeffects)](LICENSE)

A small event bus for JavaScript apps. Each handler runs as a **task** with an `AbortSignal`, so you can cancel in-flight work. Policies (`latest`, `debounce`, …) and effects (`retry`, `timeout`, …) are plain functions you pass to `on`.

## Install

```bash
npm install nanoeffects
```

ESM only, no dependencies, types included.

Want to try it first? [Open the playground](https://stackblitz.com/github/nanoeffects/nanoeffects/tree/main/examples/playground): a search box with `debounce` and `latest`, running in your browser, no install. More playgrounds (React) and recipes: [Examples](examples/README.md).

## Create a bus

Subscribe with `on`, send with `emit`. `on` returns a function that unsubscribes.

```js
import { createBus } from "nanoeffects";

const bus = createBus(); // event bus; each handler call is a task

const unbind = bus.on("greet", (name) => {
  console.log(`hello ${name}`);
});

bus.emit("greet", "Ada"); // hello Ada
unbind();
```

That is enough for a small app or a widget. The handler’s second argument is a task context (`signal`, `emit`, …). See the [Guide](docs/guide.md).

## Abort overlapping work

In a SPA, a newer search should abort the older one. Wrap the handler in `latest` and pass `ctx.signal` to `fetch` (and similar APIs).

```js
import { createBus } from "nanoeffects";
import { latest } from "nanoeffects/policies";

const bus = createBus();

// latest — a newer run aborts the older one
bus.on(
  "search",
  latest(async (query, ctx) => {
    // signal — lets latest cancel this request, not only drop its result
    const items = await api.search(query, { signal: ctx.signal });
    ctx.emit("results", items);
  }),
);
```

Same `on` / `emit`. Replace `api.search` with your own request.

## Get a result from `emit`

A **command** is like an event, but `emit` runs its handler and returns the result (a promise if the handler is async).

```js
import { createBus } from "nanoeffects";
import { createCommand } from "nanoeffects/actions";

const bus = createBus();

// createCommand — emit runs the handler and returns what it returns
const double = createCommand("math/double", (value) => value * 2);

const answer = bus.emit(double(21)); // 42
```

More (contracts, jobs, modules): [Actions](docs/actions.md).

## Docs

Start with the [Guide](docs/guide.md) (bus → policies → effects → modules), or read [why nanoeffects exists](docs/motivation.md) (SDKs, shared libraries, Module Federation). Or jump by need:

| Need | Page |
| ---- | ---- |
| Async UI races (search, submit) | [Policies](docs/policies.md) |
| Retry, timeout, wait for events | [Effects](docs/effects.md) |
| Domain logic off the UI | [Actions, commands, modules](docs/actions.md) |
| Redux / Zustand / MobX | [Stores](docs/stores.md) |

[Full index, package entries, tracing](docs/README.md) · [Examples](examples/README.md)

- **Tiny.** `createBus` is about 1.3 kB gzip; other entries load only when imported.
- **Cancellation first.** Aborting a task aborts its children and drops its result.
- **One model** instead of hand-rolled `AbortController`, lodash debounce, and retry glue.
