# Proposal

## Why

The docs teach level D (domain logic off the UI: commands, jobs, modules) with recipes of a few lines, and `domains-ts` shows two small domains. No example shows what the same ideas look like in an app people actually write: several domains that react to each other, data loaded with cancellation, a background stream that lives and dies with a module, and a send that can fail. A chat has all of these, needs only a tiny server when that server is simple and misbehaves on a known schedule, and every reader knows what it should do.

## What Changes

- A new example project, `examples/chat/`: React and TypeScript with a small Fastify server that is unstable on purpose, started by one command (`npm run dev`) and type-checked with the repository.
- Four domains, each a folder with its events, handlers and a module:
  - `rooms`: loads the room list and selects a room.
  - `messages`: loads the history of the selected room (a switch aborts the older load with `latest`), and sends a message as a job under `queue` (messages go out in order) and `retry`, with `pending`, `success`, `fail` and `cancel`, an optimistic message and a failed state.
  - `search`: finds messages in every room at once. A job under `debounce` and `latest` asks all rooms in parallel with `allSettled`, each room limited by `timeout`, so a slow room shows as skipped while the other rooms answer. Opening a result in another room selects it and waits for its history with `take` before the message is marked.
  - `incoming`: asks the server for new messages every few seconds with `poll`, inside a task started with `m.spawn` that lives while its module is mounted and stops on unmount.
- The UI is thin: components emit events and read a store per domain with `useSyncExternalStore`; found values that several components read come through a Context provider with one `useEventState`, with the warning that it is not a global store.
- A docs page, `docs/chat-example.md`, that walks through the example by problem (loading that must not race, a send that can fail, a search where one room is slow, a stream tied to a module), links to `docs/actions.md` for the API instead of repeating it, and is added to `llms.txt`. It is linked from `docs/actions.md` and `docs/starter.md`, and the example is listed in `examples/README.md`.

Out of scope: a real-time transport (the example polls), a database, authentication, a template for `create-nanoeffects` (the example is a repository project, not a package file), tests inside the example, any new API of `nanoeffects`.

- A server, `examples/chat/server/server.js` (Fastify, JavaScript, data in memory), with rules that make it unstable in a predictable way: every third send answers 503, a text that starts with `/fail` answers 400, the room Random answers a search in 2.5 s, and new messages appear every few seconds. `CHAOS=off` turns the rules off. One command starts the server and Vite together, and Vite forwards `/api`.

## Capabilities

### New Capabilities
- `chat-example`: the chat example project and the page that explains it.

### Modified Capabilities

## Impact

- New folder `examples/chat/` (not published). It is covered by `pnpm tsgo` and `pnpm check` (the lint rules of `examples/`).
- `docs/chat-example.md`, `llms.txt`, `docs/actions.md`, `docs/starter.md`, `examples/README.md`; `CHANGELOG.md` gets one line under `Unreleased` (`### Added`) because the docs page is user-visible.
- No change to `src/` and no new entry or size limit. If a typing gap in `createModule`, `createJob` or `useEventState` shows up, it is raised as its own change and not worked around with casts.
