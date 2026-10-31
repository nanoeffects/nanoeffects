# Why nanoeffects exists

Read this page to see why the library exists and when to pick it. The main reason is to take business logic and side effects out of React, Vue or Svelte components and write them as plain `async` functions, with cancellation, retries and a context for dependencies. The second part of the page is for SDKs, core libraries and micro-frontend shells, where a shared dependency is a shared risk. It does not teach the API: start with the [Guide](guide.md).

## The main reason: logic outside the UI

Components that hold requests, timers and races are hard to test and easy to break. The usual cure is services and pure functions outside the UI, and then every service needs the same things: to cancel work that is no longer wanted, to retry, to share dependencies, and to show what ran and why.

The common tools ask a lot: redux-saga writes this logic as generators, and RxJS as streams and operators. nanoeffects keeps ordinary `async` functions and adds one idea, the `AbortSignal`. The event bus is its heart but not its value: any emitter can send events (`nanoevents` is about 100 bytes, and there are [dozens more](https://github.com/gajus/sister#similar-libraries)). What nanoeffects adds is cancellable tasks, policies and effects, a context that works as a small container for dependencies, actions and modules to group a feature, and [tracing](tracing.md) with an adapter for Redux DevTools. It also fits what a project already has: recipes and small adapters for [stores](stores.md) (Redux Toolkit, Zustand, MobX, Pinia), an [RxJS](migrating-from-rxjs.md) bridge, and helpers for [React](react.md), [Vue](vue.md) and [Svelte](svelte.md), so nothing has to be rewritten to start.

## When the constraint is a shared library

A shared library (an SDK, a core package, a platform shell) is loaded by many apps. Whatever it depends on, the apps depend on too. State and event libraries are the worst case, because they keep **internal state and identity** (a store, a context, a class). Two copies or two versions of them do not merge: they silently stop seeing each other.

Module Federation makes this visible. Each remote can bring its own copy unless every team agrees on a `singleton` and a version range. The [Nx guide on library versions](https://nx.dev/docs/kb/manage-library-versions-with-module-federation) lists the result: libraries with internal state conflict, and a missing method in one version breaks callers written for another.

Real cases from the libraries nanoeffects was compared with:

| Library | What goes wrong | Source |
| ------- | --------------- | ------ |
| Redux, React Redux | A shared component library uses `react-redux`. Every micro-frontend must use the same version of that library, or `react-redux` "breaks weirdly". | [react-redux#1949](https://github.com/reduxjs/react-redux/issues/1949) |
| Redux | A store is reachable only under a `Provider`. Each sub-app needs its own provider, and a second one must not be created when a module is injected. Reducers duplicated between the host and a module add to it. | [Redux on Module Federation](https://dev.to/manomano-tech-team/how-to-work-with-redux-on-module-federation-13gm) |
| Effector | A library that uses `effector-react/scope` and is bundled into another project gets two instances. Its `Provider` is not seen by `useStore` of the app: "no scope found". | [effector#727](https://github.com/effector/effector/issues/727) |
| RxJS | Two copies give two `Observable` classes. Types of one version do not fit the other, and operators added to one copy are missing on the other. The advice is "one version in `node_modules`". | [RxJS#2984](https://github.com/ReactiveX/rxjs/issues/2984), [neo4j-javascript-driver#978](https://github.com/neo4j/neo4j-javascript-driver/issues/978) |

A library that is **not** a shared singleton cannot break this way. nanoeffects has no dependencies and no module-level state: a bus is an object you create. Two copies, or two versions, of the package in one page are two independent buses. Nothing is registered globally, no `Provider` is needed, and the host app does not have to pick a version for you.

## Why not the alternatives

| Option | Why it did not fit |
| ------ | ------------------ |
| Redux (with sagas) | A store and a provider shared by every consumer, which is the risk above. `redux-saga` also has no cheap way to get an answer back from an event: effects talk through the store. |
| Effector | A graph with global identity. A version or scope mismatch between the SDK and the app reaches the whole infrastructure. |
| Zustand | Good state, but it is a store, not a way to run and cancel work. It is the natural place to hold state next to nanoeffects: see [Stores](stores.md). |
| RxJS | Flexible, but learning its ecosystem (operators, subjects, schedulers) is a high entry cost for every developer who touches the SDK. The package is also not small: [Bundlephobia](https://bundlephobia.com/package/rxjs) reports 17.3 kB minified and gzipped for 7.8.2. |

## What the library does instead

- **No dependencies, no global state.** It is safe to ship inside an SDK next to whatever the host app runs. It does not need a `singleton` entry in the Module Federation config.
- **Small enough for a strict budget.** SDKs often get a few kilobytes for all third-party code. `createBus` is about 1.4 kB gzip (1.3 kB brotli); policies, effects and actions are separate entries you import only when you need them. See [Package entries](package.md).
- **Simple first.** `on` and `emit` are the whole model. Cancellation, retry and the rest are plain functions on top. The [Guide](guide.md) and [Coming from redux-saga](migrating-from-saga.md) map the familiar names.
- **`emit` can return an answer.** An [action with a handler](actions.md) returns a result, so one module can ask another and wait for the reply. Events alone cannot do that, and it was the main thing missing from the Redux-based options.
- **Easy to debug.** Event-driven code is hard to follow: you see an effect and not the event that caused it. Every task knows its parent, so [tracing](tracing.md) shows the chain of events, with loggers for the console, the Performance panel and Redux DevTools.

## When this is not the right tool

nanoeffects holds no state. If you need a store, keep Redux, Zustand or Effector and let the bus run the async work: [Stores](stores.md). If you already have streams everywhere, keep RxJS: [Use nanoeffects next to RxJS](migrating-from-rxjs.md).
