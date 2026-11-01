# Why nanoeffects exists

> **Level A.** Read first: [README](../README.md).

Read this page to see why the library exists. It moves business logic and side effects out of React, Vue or Svelte components into plain `async` functions, with cancellation, retries and a context for dependencies. It does not teach the API: start with the [Guide](guide.md).

## Moving logic out of the UI

Components that hold requests, timers and races are hard to test and easy to break. The usual cure is services and pure functions outside the UI, and then every service needs the same things: to cancel work that is no longer wanted, to retry, to share dependencies, and to show what ran and why.

The common tools ask a lot: redux-saga writes this logic as generators, and RxJS as streams and operators. nanoeffects keeps ordinary `async` functions and adds one idea, the `AbortSignal`.

Another way to take logic out of the UI is a dependency injection (DI) container, such as the one in Angular or in any DI library. nanoeffects has no container, but it can do dependency injection at the level of the contract: a handler takes what it needs from `ctx`, and the bus decides what to give. See [Context fields](context.md).

The event bus is the heart of the library but not its value: any emitter can send events (`nanoevents` is about 100 bytes, and there are [dozens more](https://github.com/gajus/sister#similar-libraries)). What nanoeffects adds is cancellable tasks, policies and effects, a context that works as a small container for dependencies, actions and modules to group a feature, and [tracing](tracing.md) with an adapter for Redux DevTools. It also fits what a project already has: recipes and small adapters for [stores](stores.md) (Redux Toolkit, Zustand, MobX, Pinia), an [RxJS](migrating-from-rxjs.md) bridge, and helpers for [React](react.md), [Vue](vue.md) and [Svelte](svelte.md), so nothing has to be rewritten to start.

## Micro-frontends

In micro-frontends every app can bring its own versions of the same libraries. State and event libraries are the worst case, because they keep **internal state and identity** (a store, a context, a class). Two copies or two versions of them do not merge: they silently stop seeing each other. Different versions and copies also do more than work out of step: they load more code and use more resources than one agreed copy would. So the goal is a project that is as simple as possible, with as few shared dependencies that hold state as possible.

Module Federation makes this visible. Each remote can bring its own copy unless every team agrees on a `singleton` and a version range. The [Nx guide on library versions](https://nx.dev/docs/kb/manage-library-versions-with-module-federation) lists the result: libraries with internal state conflict, and a missing method in one version breaks callers written for another.

Real cases from the libraries nanoeffects was compared with:

| Library | What goes wrong | Source |
| ------- | --------------- | ------ |
| Redux, React Redux | A shared component library uses `react-redux`. Every micro-frontend must use the same version of that library, or `react-redux` "breaks weirdly". | [react-redux#1949](https://github.com/reduxjs/react-redux/issues/1949) |
| Redux | A store is reachable only under a `Provider`. Each sub-app needs its own provider, and a second one must not be created when a module is injected. Reducers duplicated between the host and a module add to it. | [Redux on Module Federation](https://dev.to/manomano-tech-team/how-to-work-with-redux-on-module-federation-13gm) |
| Effector | A library that uses `effector-react/scope` and is bundled into another project gets two instances. Its `Provider` is not seen by `useStore` of the app: "no scope found". | [effector#727](https://github.com/effector/effector/issues/727) |
| RxJS | Two copies give two `Observable` classes. Types of one version do not fit the other, and operators added to one copy are missing on the other. The advice is "one version in `node_modules`". | [RxJS#2984](https://github.com/ReactiveX/rxjs/issues/2984), [neo4j-javascript-driver#978](https://github.com/neo4j/neo4j-javascript-driver/issues/978) |

nanoeffects has no dependencies and no module-level state: a bus is an object you create. Two copies, or two versions, of the package in one page are two independent buses. Nothing is registered globally, no `Provider` is needed, and the host app does not have to pick a version for you.

## What the library does

- **No dependencies, no global state.** It is safe to ship inside an SDK next to whatever the host app runs. It does not need a `singleton` entry in the Module Federation config.
- **Small enough for a strict budget.** SDKs often get a few kilobytes for all third-party code. `createBus` is about 1.4 kB gzip (1.3 kB brotli); policies, effects and actions are separate entries you import only when you need them. See [Package entries](package.md).
- **Easy to start.** `on` and `emit` are the whole model. Cancellation, retry and the rest are plain functions on top. The [Guide](guide.md) and [Coming from redux-saga](migrating-from-saga.md) map the familiar names.
- **`emit` can return an answer.** An [action with a handler](actions.md) returns a result, so one module can ask another and wait for the reply. Events alone cannot do that, and it was the main thing missing from the Redux-based options.
- **Easy to debug.** Event-driven code is hard to follow: you see an effect and not the event that caused it. Every task knows its parent, so [tracing](tracing.md) shows the chain of events, with loggers for the console, the Performance panel and Redux DevTools.
