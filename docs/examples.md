# Examples

> **Levels A to F.** Read first: [README](README.md#the-ladder-from-a-to-f).

Examples to run in the browser and to read. Every folder lives in `examples/` of the repository and is type-checked with the project. Two of them are explained step by step: [Build a chat](chat-example.md) and [Build a chat widget](chat-widget.md).

## Try it in the browser

All three are the same search box: type fast and only one request starts (`debounce`); type again while a request runs and the older one is aborted (`latest`). StackBlitz runs them with no install.

| Folder | What is in it |
| ------ | ------------- |
| [`playground`](../examples/playground) · [StackBlitz](https://stackblitz.com/github/nanoeffects/nanoeffects/tree/main/examples/playground) | Plain DOM and one file: the smallest setup. The page lists the requests, so the abort is visible. |
| [`playground-react`](../examples/playground-react) · [StackBlitz](https://stackblitz.com/github/nanoeffects/nanoeffects/tree/main/examples/playground-react) | The same search in a React component, with the bus outside React. |
| [`playground-devtools`](../examples/playground-devtools) · [StackBlitz](https://stackblitz.com/github/nanoeffects/nanoeffects/tree/main/examples/playground-devtools) | The same search with its emits and stopped calls sent to Redux DevTools. |

## Bigger projects

React and TypeScript projects that show where logic goes when an app has several features.

| Folder | What is in it |
| ------ | ------------- |
| [`chat`](../examples/chat) · [StackBlitz](https://stackblitz.com/github/nanoeffects/nanoeffects/tree/main/examples/chat) | Rooms, history under `latest`, ordered sends under `queue` and `retry`, search under `allSettled`, polling with `poll`. Explained in [Build a chat](chat-example.md). |
| [`pokedex`](../examples/pokedex) · [StackBlitz](https://stackblitz.com/github/nanoeffects/nanoeffects/tree/main/examples/pokedex) | Real requests to PokeAPI: a search with `debounce`, `latest`, `timeout` and `retry`, abilities with `allSettled`. |
| [`spells`](../examples/spells) · [StackBlitz](https://stackblitz.com/github/nanoeffects/nanoeffects/tree/main/examples/spells) | The smallest example: a search in one file, one action that carries its handler. |
| [`countdown`](../examples/countdown) · [StackBlitz](https://stackblitz.com/github/nanoeffects/nanoeffects/tree/main/examples/countdown) | "Take the discount in 15 seconds": a `race` between a button and a timer, and a Restart that disposes the old session. |
| [`spells`](../examples/spells) · [StackBlitz](https://stackblitz.com/github/nanoeffects/nanoeffects/tree/main/examples/spells) | The smallest example: a search in one file, one action that carries its handler. |
| [`chat-widget`](../examples/chat-widget) · [StackBlitz](https://stackblitz.com/github/nanoeffects/nanoeffects/tree/main/examples/chat-widget) | A chat behind a launcher button: opening mounts one module, closing unmounts it. Explained in [Build a chat widget](chat-widget.md). |
| [`counter`](../examples/counter) · [StackBlitz](https://stackblitz.com/github/nanoeffects/nanoeffects/tree/main/examples/counter) | The counter of the redux-saga tutorial, without a store and with Redux Toolkit. |
| [`rickandmorty`](../examples/rickandmorty) · [StackBlitz](https://stackblitz.com/github/nanoeffects/nanoeffects/tree/main/examples/rickandmorty) | Characters with React Query: requests are actions that get its abort signal. |
| [`trades`](../examples/trades) · [StackBlitz](https://stackblitz.com/github/nanoeffects/nanoeffects/tree/main/examples/trades) | A live stream over a WebSocket: `retry`, `latest` and `throttle`. |

## Backend examples

Small [Fastify](https://fastify.dev) apps with no database. They need Node 18 or newer: run `npm install` and `npm start` in the folder. More in [Stop work on a server](server.md).

| Folder | What is in it |
| ------ | ------------- |
| [`api-server`](../examples/api-server) | A server over PokeAPI: `timeout`, `retry`, `allSettled`, and an abort when the client leaves. |
| [`job-worker`](../examples/job-worker) | A queue worker: `queue`, `retry`, `timeout`, counts from the outcomes of a job. |
| [`ws-server`](../examples/ws-server) | A WebSocket server: one controller per socket, `latest` with a `key`. |

## Recipes

Each file is one job, written as a short program with a comment on every nanoeffects call.

| File | Job | Docs |
| ---- | --- | ---- |
| [`search.ts`](../examples/search.ts) | A search box that waits for quiet and aborts the older request. | [Policies](policies.md) |
| [`backoff.ts`](../examples/backoff.ts) | Retry a flaky request with a growing pause. | [Effects](effects.md#backoff) |
| [`registration-form.ts`](../examples/registration-form.ts) | A sign-up form: a username check that does not race. | [React form](react.md) |
| [`scope.ts`](../examples/scope.ts) | An action with its own effects and a test that replaces one. | [Working with context](context.md) |
| [`modules.ts`](../examples/modules.ts) | Domain logic with no UI, mounted and unmounted as one unit. | [Actions](actions.md) |
| [`redux.ts`](../examples/redux.ts) | Redux Toolkit actions that also reach the bus. | [State managers](stores.md) |
| [`guide.ts`](../examples/guide.ts) | The code of every step of the guide. | [Guide](guide.md) |

## TypeScript projects

| Folder | What is in it |
| ------ | ------------- |
| [`typescript`](../examples/typescript) | Name the event map once and use it in modules and actions. |
| [`typescript-context`](../examples/typescript-context) | Give `ctx` the fields of your bus and type them from one place. |
