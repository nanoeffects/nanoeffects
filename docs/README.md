# Documentation

nanoeffects moves business logic and side effects out of UI components into plain `async` functions. Policies (`latest`, `debounce`, `queue`) and effects (`retry`, `timeout`, `poll`) handle races, retries and cancellation.

```js
import { createBus } from "nanoeffects";
import { latest } from "nanoeffects/policies";

const bus = createBus(); // event bus

// The search logic lives outside the component; latest aborts the previous request
bus.on(
  "search",
  latest(async (query, { signal }) => {
    const items = await api.search(query, { signal });
    bus.emit("found", items);
  }),
);

// The component only listens for the result and sends events
bus.on("found", (items) => render(items));
bus.emit("search", "nano");
```

## Install

```bash
npm install nanoeffects
```

To start a new project from a template ([Start a project from a template](starter.md)):

```bash
npm create nanoeffects@latest my-app
```

## Where to start

1. Follow the [Guide](guide.md#1-create-a-bus): from the first bus to modules.
2. Common async UI problems (stale responses, double clicks, retries) are in [Common tasks](recipes.md).

## The ladder, from A to F

Read the docs from the level of your project and stop when it has what it needs. Each level adds one idea. A page says at its top which level it is for and what to read first.

| Level | Your project | You can stop here when | Read |
| ----- | ------------ | ---------------------- | ---- |
| **A** | A small app, widget or MVP with rare races | Events and handlers do the job | [Guide](guide.md#1-create-a-bus) |
| **B** | A SPA with async UI: search, sending messages, unmounting components | A newer request must replace an older one | [Policies](policies.md), [Guide](guide.md#3-abort-the-previous-run-with-latest) |
| **C** | Complex business logic | Retries, timeouts and waiting are handled | [Effects](effects.md), [Guide](guide.md#5-add-retry-and-timeout) |
| **D** | Domain logic that must live off the UI | Features are actions and modules, not components | [Actions, jobs and modules](actions.md), [Guide](guide.md#7-name-events-three-ways) |
| **E** | An existing Redux, Zustand, MobX or Pinia app, or a data library | The bus runs the async work next to your store | [Stores](stores.md), [Query libraries](query-libraries.md) |
| **F** | A platform, an SDK or a long-lived app | You can see what ran and reload modules | [Tracing](tracing.md), [Hot reload](hmr.md), [Semantics](semantics.md) |

A small app never needs level B or higher. Move up when the first problem of that level appears, not before.

Code for every guide step: [`examples/guide.ts`](../examples/guide.ts) (type-checked and tested).

## Jump by need

For a problem, start from [Common tasks](recipes.md). For a project shape:

| Project shape | First page |
| ------------- | ---------- |
| Small app / widget (rare races) | [Guide § Create a bus](guide.md#1-create-a-bus) |
| SPA with async UI | [Policies](policies.md), [Guide § latest](guide.md#3-abort-the-previous-run-with-latest) |
| Unreliable network / long flows | [Effects](effects.md) — one helper per job, then the rest as reference |
| Domain logic off the UI | [Actions, handlers, modules](actions.md) |
| Already on Redux / Zustand / MobX / Pinia | [Stores](stores.md) |
| A Node server (Fastify) whose work must stop when the client leaves | [Stop work on a server](server.md) |
| A React form with async checks | [Build a sign-up form in React](react.md) |
| A site widget that listens only while open | [Build a chat widget](chat-widget.md) |
| A Vue app | [Use nanoeffects in a Vue app](vue.md) |
| A Svelte app | [Use nanoeffects in a Svelte app](svelte.md) |
| Old responses overwrite new ones | [Cancel stale requests](cancel-stale-requests.md) |
| Debounced input that must also cancel the old request | [Pause between requests](debounce-and-abort.md) |
| A second click sends a second request | [Prevent a double submit](prevent-double-submit.md) |
| Using mitt, nanoevents or EventEmitter | [Coming from mitt](migrating-from-mitt.md) |
| Moving from redux-saga | [Coming from redux-saga](migrating-from-saga.md) |
| Using RxJS | [Use nanoeffects next to RxJS](migrating-from-rxjs.md) |
| Moving from Effector | [Coming from Effector](migrating-from-effector.md) |

## Reference

Look these up when you need the exact rule.

- [Package entries](package.md): which import holds what
- [Plugins](plugins.md): every plugin of a bus, what it returns, and the order to use them in
- [Semantics](semantics.md): the exact rules of emit, abort and ordering
- [Tracing](tracing.md): loggers, Redux DevTools, `notrace`
- [Observable](observable.md): events as TC39 Observables
- [Hot reload and dev diagnostics](hmr.md)
