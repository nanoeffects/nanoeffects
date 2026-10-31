# nanoeffects

[![npm](https://img.shields.io/npm/v/nanoeffects)](https://www.npmjs.com/package/nanoeffects)
[![CI](https://github.com/nanoeffects/nanoeffects/actions/workflows/ci.yml/badge.svg)](https://github.com/nanoeffects/nanoeffects/actions/workflows/ci.yml)
[![size](https://img.shields.io/bundlephobia/minzip/nanoeffects)](https://bundlephobia.com/package/nanoeffects)
[![license](https://img.shields.io/npm/l/nanoeffects)](LICENSE)

Move business logic and side effects out of React, Vue and Svelte components into plain `async` functions, with cancellation built in.

## Install

```bash
npm install nanoeffects
```

ESM only, no dependencies, types included.

New project: `npm create nanoeffects@latest my-app` ([Docs](docs/starter.md)). Try it first: [playground](https://stackblitz.com/github/nanoeffects/nanoeffects/tree/main/examples/playground) in your browser, no install.

## Create a bus

This is how the project works inside: every handler is an `on` listener and every message an `emit`. You rarely need to think about it, because policies, actions and modules (below) do the work. Full API of the bus (`once`, `off`, options): [Guide](docs/guide.md#1-create-a-bus).

```js
import { createBus } from "nanoeffects";

const bus = createBus(); // event bus; each handler call is a task

// two independent listeners of one event; on returns the function that unsubscribes
const unbind = bus.on("cart/added", (item) => analytics.track("add", item));
bus.on("cart/added", (item) => console.log("added", item.id));

bus.emit("cart/added", { id: "p1" }); // both listeners run
unbind(); // stop tracking
```

## Keep the logic out of the component

A newer search should abort the older one. Put it in a handler outside the component, wrapped in `latest`.

```js
// search.js — no React, Vue or Svelte in this file
import { createBus } from "nanoeffects";
import { latest } from "nanoeffects/policies";

// createBus — one bus for the logic of the app
export const bus = createBus();

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

`ctx.signal` is a standard [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal), built into browsers and Node: `fetch` and many other APIs accept it and stop when it aborts.

The handler knows nothing about the UI: it only emits `results`. The component sends `search` and listens to `results`. React has hooks for it (`useEventState`, `useEmitter`: [React](docs/react.md#show-the-last-value-of-an-event-as-state)), and [Vue](docs/vue.md) and [Svelte](docs/svelte.md) have their own helpers:

```jsx
// SearchBox.jsx
import { useEffect, useState } from "react";
import { bus } from "./search";

export function SearchBox() {
  const [items, setItems] = useState([]);

  // on returns the unbind function; returning it removes the listener on unmount
  useEffect(() => bus.on("results", setItems), []);

  return (
    <>
      <input onChange={(event) => bus.emit("search", event.target.value)} />
      <ul>
        {items.map((item) => (
          <li key={item.id}>{item.title}</li>
        ))}
      </ul>
    </>
  );
}
```

## Load data and await the result

Give an action a handler, and `emit` returns its result. The caller does not import the request.

```js
import { createBus } from "nanoeffects";
import { createAction } from "nanoeffects/actions";

const bus = createBus();

// createAction with a handler — emit returns what the handler returns
const getUser = createAction("user/get", async (id, ctx) => {
  const response = await fetch(`/users/${id}`, { signal: ctx.signal });
  return response.json();
});

const user = await bus.emit(getUser("1"));
```

This is one way to load data. If you already use React Query or SWR, keep them: see [Query libraries](docs/query-libraries.md).

## Take dependencies from the context

Put an API client, a store or a logger on every task once. A test passes a fake one. Here the client is an [axios](https://axios-http.com) instance, but any object works.

```js
import axios from "axios";
import { createBus } from "nanoeffects";

const api = axios.create({ baseURL: "/api" });

// context — every task gets these fields: the bus is the container for your dependencies
const bus = createBus({ context: { api } });

bus.on("save", async (draft, ctx) => {
  await ctx.api.put("/drafts", draft, { signal: ctx.signal });
});
```

## Docs

Start with the [Guide](docs/guide.md), or jump by need:

| Need | Page |
| ---- | ---- |
| Async UI races (search, submit) | [Policies](docs/policies.md) |
| Retry, timeout, wait for events | [Effects](docs/effects.md) |
| Domain logic off the UI | [Actions, handlers, modules](docs/actions.md) |
| Redux / Zustand / MobX / Pinia next to the bus | [Stores](docs/stores.md) |
| Coming from redux-saga, RxJS or a small emitter | [redux-saga](docs/migrating-from-saga.md), [RxJS](docs/migrating-from-rxjs.md), [mitt and nanoevents](docs/migrating-from-mitt.md) |
| See what ran and why (console, Redux DevTools) | [Tracing](docs/tracing.md) |

[Full index and package entries](docs/README.md) · [Examples](examples/README.md)

## Why

Requests, timers and races pile up in components, so the logic goes into services. Those need cancel, retry, shared dependencies and a way to see what ran. [redux-saga](https://redux-saga.js.org) does it with generators, [RxJS](https://rxjs.dev) with streams. nanoeffects keeps plain `async` functions and adds one idea, the built-in [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal).

The bus is only the heart: any emitter ([`nanoevents`](https://github.com/ai/nanoevents) is ~100 bytes, [many more](https://github.com/gajus/sister#similar-libraries)) can send events. On top come cancellable tasks, a context for dependencies, actions and modules per domain, and tracing with Redux DevTools.

- **Plain `async` functions.** No generators, no streams.
- **Fits what you have.** Recipes for [Redux Toolkit, Zustand, MobX and Pinia](docs/stores.md), an [RxJS](docs/migrating-from-rxjs.md) bridge, helpers for [React](docs/react.md), [Vue](docs/vue.md) and [Svelte](docs/svelte.md).
- **Tiny, no dependencies.** `createBus` is about 1.4 kB gzip (1.3 kB brotli). Safe inside an SDK.

More: [Why nanoeffects exists](docs/motivation.md).
