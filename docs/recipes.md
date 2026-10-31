# Recipes

> **Levels A to E.** Read first: [README](../README.md).

Find the page for the problem you have. The recipes go from the simplest to the most involved. Each line links to the page or section that solves it; the code is there, not here.

## Events and handlers

- **Two parts of the app must react to one thing.** Subscribe twice, emit once: [Guide, create a bus](guide.md#1-create-a-bus).
- **A handler needs an API client, a store or a logger.** Put it on every task once: [Context fields](context.md).
- **A handler fails and the others must still run.** [Errors and unheard events](errors.md#isolate-failing-handlers).
- **I mistyped an event name and nothing happened.** [Warn when nobody listens](errors.md#warn-when-nobody-listens).

## Races and repeated actions in the UI

- **An old response overwrites a new one.** [Cancel stale requests](cancel-stale-requests.md), then [Policies](policies.md#abort-the-previous-run).
- **A search box sends a request on every key.** [Debounce a request and abort the previous one](debounce-and-abort.md).
- **A second click sends a second request.** [Prevent a double submit](prevent-double-submit.md).
- **Saves must run one after another, in order.** [Policies, `queue`](policies.md#run-calls-one-after-another-with-queue).
- **One policy per item, not one for the whole app.** [Policies, `key`](policies.md#isolate-state-by-key).
- **A form with a username check and a submit.** [Build a sign-up form in React](react.md).

## An unreliable network and long flows

- **A request fails sometimes.** [Retry](effects.md#wrap-a-handler-with-retry-and-timeout), then [back off between retries](effects.md#back-off-between-retries).
- **A request hangs.** [Timeout](effects.md#wrap-a-handler-with-retry-and-timeout).
- **Refresh data every N seconds.** [Poll](effects.md#wrap-a-handler-with-retry-and-timeout).
- **Wait for another event before going on.** [Wait for the next event with `take`](effects.md#wait-for-the-next-event-with-take).
- **Load several things at once, or take the fastest.** [Run several starters together](effects.md#run-several-starters-together).

## Features and domain logic

- **I want to call a handler and get its result.** [Actions, jobs and modules](actions.md).
- **Group one feature with its handlers.** [Modules](actions.md) and [Guide, mount a domain as a module](guide.md#9-mount-a-domain-as-a-module).
- **A whole app in layers: entities, features, modules, a server.** [Build a chat](chat-example.md).
- **A widget that listens only while it is open.** [Build a chat widget](chat-widget.md).
- **Use the bus from a class.** [Use the bus from a class](oop.md).
- **Keep the types of the bus in many files.** [TypeScript in many files](typescript.md).

## Frameworks

- **React.** [Build a sign-up form in React](react.md).
- **Vue.** [Use nanoeffects in a Vue app](vue.md).
- **Svelte.** [Use nanoeffects in a Svelte app](svelte.md).

## Libraries and stores

- **I use Redux Toolkit, Zustand, MobX or Pinia.** [Connect a store](stores.md).
- **I use React Query, SWR or RTK Query.** [Query libraries](query-libraries.md).
- **I use RxJS.** [Use nanoeffects next to RxJS](migrating-from-rxjs.md) and [Observables](observable.md).

## Servers

- **Stop work on a server when the client leaves.** [Stop work on a server](server.md).

## Coming from another library

- [redux-saga](migrating-from-saga.md), [Effector](migrating-from-effector.md), [mitt, nanoevents or EventEmitter](migrating-from-mitt.md), [RxJS](migrating-from-rxjs.md).

## Seeing what ran

- **I cannot tell which event caused an effect.** [Trace tasks](tracing.md).
- **Reload modules without a page refresh.** [Hot reload](hmr.md).
