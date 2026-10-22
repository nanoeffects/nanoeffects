# Tasks

## 1. The shared block and the intro

- [x] 1.1 In `docs/stores.md`, rename the shared block to `// search-bus.js` and rewrite it: actions `queryChanged` and `searchLoaded`, `emitQueryChanged`, the `debounce(300, latest(...))` handler that calls `api.search` with `ctx.signal` and emits `searchLoaded(items)`; each nanoeffects call has a comment; exports `bus`, `searchLoaded`, `emitQueryChanged`.
- [x] 1.2 Rewrite the intro of "Emit from a state manager": name the two directions ("the store triggers an event", "the event changes the store"), say once not to write the field that is watched, and point to the subsections.

## 2. One subsection per store

- [x] 2.1 Nanostores, MobX, Valtio, Jotai, Zustand: a store with `query` and `results`, `query` → `emitQueryChanged`, `bus.on(searchLoaded, ...)` writing `results` in the idiom of that store; imports from `./search-bus`; one or two sentences each.
- [x] 2.2 Pinia: the same shape with `watch(() => search.query, emitQueryChanged)` and the write-back; remove the Pinia copy of the bus.
- [x] 2.3 Trim "Change the store from a handler" to what the subsections do not say; keep the context line and the MobX `flow` note; update the table of contents and the "Stop watching a store" text (both subscriptions).

## 3. Check

- [x] 3.1 `pnpm docs:check` passes with all the new blocks checked, no skip marker in the section; `pnpm llms:check` passes.
- [x] 3.2 Read each subsection against the docs of its store (the write idiom, the callback shape); fix any claim you cannot confirm or drop it.
- [x] 3.3 `CHANGELOG.md`: reword the `docs/stores.md` line of `framework-recipes` to the search scenario.
- [x] 3.4 `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm vitest run && pnpm build`, then `pnpm verify`; it must pass.
