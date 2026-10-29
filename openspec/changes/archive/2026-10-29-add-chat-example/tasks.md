# Tasks

## 1. The mock and the domains

- [x] 1.1 Create `examples/chat/` with `package.json`, `tsconfig.json`, `index.html`, `src/api.ts` and `src/bus.ts` (bus and `reactPlugin`, no events). Verify with `pnpm tsgo`.
- [x] 1.6 Add the server: `server/server.js` (Fastify, data in memory, the rules that make it unstable, `CHAOS=off`), `server/dev.js` (starts the server and Vite in one process), `vite.config.ts` (forwards `/api`), and replace the mock in `src/api.ts` with a `fetch` client that passes the task's signal. Give the send `retry` a `shouldRetry` that skips a status below 500, and make `incoming` use `poll` against `GET /api/updates`. Verify with `pnpm tsgo`, `pnpm check`, and a scratch install that runs the scenarios against the live server, with and without `CHAOS=off`.
- [x] 1.2 Add the `rooms` domain: events (`roomSelected`, a `loadRooms` job), handlers, store, module that loads the list with `m.spawn`. Verify with `pnpm tsgo` and `pnpm check`.
- [x] 1.3 Add the `messages` domain: events (`historyLoaded`, the `sendMessage` job), handlers (history under `latest`; send under `queue` and `retry`, throwing a `SendFailed` that carries the `localId`), store with the optimistic message and the `sending`, `delivered` and `failed` states, module listening to `roomSelected` and `messageReceived`. Verify with `pnpm tsgo` and `pnpm check`, and by a scratch script that a room switch aborts the older load and that `/fail` ends as failed while the next message is delivered in order.
- [x] 1.4 Add the `search` domain: events (`searchMessages` job, `resultOpened`, `messageMarked`), handlers (job under `debounce` and `latest`; `allSettled` over the rooms with `timeout` for each; opening a result with `take`), store with hits and skipped rooms, module. The mock makes one room slow for search. Verify with `pnpm tsgo` and `pnpm check`, and by a scratch script that a slow room is reported as skipped, that a newer query aborts the older search, and that opening a result in another room marks the message only after its history loaded.
- [x] 1.5 Add the `incoming` domain: event `messageReceived`, `poll` under `m.spawn` that stops when its module is unmounted, module. Verify with a scratch script that unmounting stops the polling.

## 1b. Review

- [x] 1.7 Review the example for a junior reader: names say what things are, comments say why (not what), no clever one-liners, each file has one job, and the lint rules of `examples/` pass. Fix what the review finds. Verify with `pnpm check` and `pnpm tsgo`.

## 2. The thin UI

- [x] 2.1 Add `src/app.ts` (`modulePlugin` with the three modules), `src/main.tsx` and `src/ui/` (`App`, `RoomList`, `MessageList` with the message states, `Composer`, a search box with the result list, a button that mounts and unmounts `incoming`), reading stores with `useSyncExternalStore` and the room list through one `useEventState` with the not-a-store comment. No component imports `api.ts`. Verify with `pnpm tsgo`, `pnpm check`, and by building the project with `vite build` from a scratch install.

## 3. Docs

- [x] 3.1 Write `docs/chat-example.md` (problems first: loading that must not race, a send that can fail, a stream tied to a module; local checked snippets; links to `docs/actions.md`). Add it to `llms.txt`, link it from `docs/actions.md` and `docs/starter.md`, add the project to `examples/README.md` with its StackBlitz link, and add the line to `CHANGELOG.md` under `Unreleased` (`### Added`). Verify with `pnpm docs:check` and `pnpm llms:check`.

## 4. Integration

- [x] 4.1 Run `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm vitest run && pnpm build`. Install and run the example from a scratch copy against the packed package and confirm the scenarios (room switch, `/fail`, a slow room in the search, opening a result, unmount). Verify all pass.
