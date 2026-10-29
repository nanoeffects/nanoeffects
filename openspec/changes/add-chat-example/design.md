# Design

## Context

`examples/playground-react` is a standalone project (own `package.json` and `tsconfig.json`, depends on a published `nanoeffects`) that the root `tsconfig.json` also type-checks through `include: ["examples"]` and the `paths` to `src`. `examples/` is under the readability lint rules of biome (no casts in call arguments, no `as unknown as`, limits on nested callbacks). `domains-ts` (`packages/create-nanoeffects/templates/domains-ts`) already has the layout this example grows: events, handlers, module per domain; `bus.ts`, `app.ts`, a store per domain. See proposal.md for why.

Observed in `src/actions`, `src/policies` and `src/effects`: `allSettled(ctx, starters)` (array or record, each starter gets `{ signal }`), `timeout(ctx, ms, starter)`, `take(ctx, eventKey, options)`; `createJob` outcomes, `createModule` with `handle`, `on` and `spawn`, `modulePlugin`; `latest`, `queue`, `retry(task, options)` as a task wrapper.

## Goals / Non-Goals

**Goals:**
- Show domains that react to each other's events without importing each other's code.
- Show what each of the three outcomes of a job is for, in a flow people know.
- Keep the code short enough to read in one sitting: about a dozen small files.

**Non-Goals:**
- A real chat: no users, rooms are fixed data on the server, history is one page.
- A new template, or any change in `src/`.

## Decisions

- **Layout.**

  ```
  examples/chat/
    index.html, package.json, tsconfig.json
    src/main.tsx            renders the app
    src/bus.ts              createBus + reactPlugin; imports no events
    src/app.ts              bus.use(modulePlugin([roomsModule, messagesModule, incomingModule]))
    src/api.ts              the client: one function per request, with fetch and the signal of the task
    server/server.js        the Fastify server: routes, data in memory, the rules that make it unstable
    server/dev.js           starts the server and Vite in one process
    vite.config.ts          forwards /api to the server
    src/domains/rooms/      rooms.ts (events), rooms-handlers.ts, rooms-store.ts, rooms-module.ts
    src/domains/messages/   messages.ts, messages-handlers.ts, messages-store.ts, messages-module.ts
    src/domains/search/     search.ts, search-handlers.ts, search-store.ts, search-module.ts
    src/domains/incoming/   incoming.ts, incoming-handlers.ts, incoming-module.ts
    src/ui/                 App.tsx, RoomList.tsx, MessageList.tsx, Composer.tsx
  ```

  Domains talk by events: `rooms` emits `roomSelected`; `messages` listens to it and loads the history; `incoming` emits `messageReceived`; `messages` appends it. A domain imports the events file of another, never its handlers or its store.
- **`rooms` loads at mount.** The module starts `m.spawn` that loads the list (a job, `loadRooms`), and its store is written from the outcomes. The UI does not know when to load.
- **History under `latest`.** `messages` handles `roomSelected` with `latest`, so a quick switch aborts the older request, and a result for an aborted request is never delivered (the task guarantee), which the store does not have to check.
- **Send is a job under `queue` and `retry`.** `queue` keeps the order of messages; `leading` would drop a second message sent while the first is on its way, which is wrong for a chat. `retry` tries a failed send again (2 attempts). The call carries a `localId`: `pending` adds the optimistic message, `success` marks it delivered, `fail` marks it failed.
- **A `fail` outcome gets only the error, not the call.** To know which message failed, the handler throws a `SendFailed` error that carries the `localId`, and the module reads it. This is the one place the example works around the shape of the outcome; it stays in the example and shows a real pattern. If a reader finds it awkward, that is input for a separate change (a job whose `fail` carries the payload), not for this one.
- **`cancel` marks messages that were still sending as failed.** It gets the reason only; the example uses it for the case of an unmounted module.
- **Search is where the effects are.** `searchMessages` is a job under `debounce` and `latest` (the same policies as the other starters, now with a job's outcomes for the loading and the result). Its handler asks every room with `allSettled(ctx, rooms.map(...))`, each request wrapped in `timeout(ctx, 1500, ...)`. The server makes one room slow (2.5 s for search), so the page shows partial results and a line such as "Random did not answer". `all` would fail the whole search on the first slow room, which is the wrong behavior here; `allSettled` is the point of the example. Opening a result in another room emits `roomSelected`, then `take(ctx, "messages/loadHistory/success")` waits for that room's history, then `messageMarked(id)` is emitted. A result in the selected room skips the wait.
- **Effects not used, and why.** `retry` is used by the send and `poll` by the incoming messages. `race` has no second source to race, and `cancellable` has no side effect to make cancellable; they are left to the docs.
- **Incoming messages.** `incoming-handlers.ts` is a loop under `m.spawn`: wait (honoring the signal), emit `messageReceived`, repeat. It lives as long as the module and stops on unmount. A button in the UI mounts and unmounts it with `app.mount` and `app.unmount`, so the lifecycle is visible.
- **State.** A Zustand store per domain, made with `zustand/vanilla` and its `immer` middleware: the store lists its mutations (`startLoading(roomId)`, `markFailed(localId)`, ...); a mutation of plain values gives `set` an object (`set({ searching: true })`) and, in the messages store only, which has lists, the `immer` middleware lets a mutation change a draft in place (`state.messages.push(message)`), a module calls them with the data of an event (`module.on(loadHistory.pending, startLoading)`), and a component reads the state with `useStore`. This is the plain recipe of `docs/stores.md`; the library has no Zustand adapter on purpose. `immer` is a dev dependency of the repository so the example is type-checked with the real draft types. The room list is also read through a Context provider with one `useEventState` at the root, as the one place the hook is used, with the not-a-store comment.
- **A server, because aborts should be real.** With `fetch` and the task's signal, an aborted request shows as cancelled in the browser's Network panel and the server can log it, which a mock cannot show. Only `api.ts` changes from the mock to `fetch`; the domains call the same functions.
- **Unstable by a schedule, not by chance.** A random server would make the docs unable to say what happens. The rules: every third `POST` answers 503 (so `retry` shows its work), `/fail` answers 400 (so `shouldRetry` shows why a rejection is not retried), the room `random` answers a search in 2.5 s against a timeout of 1.5 s, and the room `random` loads its history slowly. `CHAOS=off` turns them off.
- **One command.** `server/dev.js` starts the Fastify server and then Vite through its JavaScript API in the same Node process, with the proxy of `/api` in `vite.config.ts`. No extra dependency such as `concurrently`, and one process is easier on StackBlitz. `fastify` and `vite` are dependencies of the example; the root of the repository gets neither, so the server is plain JavaScript that biome checks and TypeScript does not.
- **Incoming messages are polled.** The server appends a message every few seconds and numbers them. The `incoming` task calls `poll(ctx, fn, 3000)` and asks `GET /api/updates?since=<number>`; a failed request is caught inside the poll function so the polling goes on. Unmounting aborts the task and the poll ends. This uses `poll`, the effect that a server makes natural and that a mock does not.
- **The retry rule.** `retry(task, { times: 3, delay: 200, shouldRetry })` where `shouldRetry` is false for an error that carries a status below 500: a 400 is the answer, and asking again gives the same answer.
- **Docs page, not a page per domain.** `docs/chat-example.md` is organized by problem, with short local snippets (docs-check requires blocks to stand alone) and a link to the file for the whole code; it does not repeat the API of `docs/actions.md`.
- **StackBlitz.** The project has its own `package.json` with `nanoeffects`, `react`, `react-dom`, `vite` and `typescript`, like `playground-react`, and is listed in `examples/README.md` with the StackBlitz link.

## Risks / Trade-offs

- [The server needs `fastify` installed to run] → it is a dependency of the example, so `npm install` in the example is enough; the repository does not run it in `pnpm verify`, and a scratch install runs the scenarios before the change is done.
- [The lint rules of `examples/` reject natural code, such as inline casts and nested callbacks] → name the intermediate values; no `eslint-disable`-style escapes.
- [The example drifts from the docs page] → the page quotes small snippets that `pnpm docs:check` checks, and points to the files for the rest.
- [The `SendFailed` pattern looks like a library gap] → it is explained where it is used and raised in the final report, not hidden.
- [The example is large for a first read] → the README row says it is a level D example and points to `domains-ts` as the smaller start.

## Open Questions

- Whether the mount button should be shown (it teaches the lifecycle, and adds UI): decided while writing the UI.
