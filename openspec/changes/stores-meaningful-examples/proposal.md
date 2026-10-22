# Proposal: one meaningful scenario for every store in `docs/stores.md`

## Why

The subsections of "Emit from a state manager" (Nanostores, MobX, Valtio, Jotai, Zustand, Pinia) all use the toy case: a `name` field and `saveName`. A reader cannot tell why they would send a name change through a bus, and each store shows only one direction (the store calls the bus). The owner asks for sensible examples and for an example of how a store is triggered. One real, familiar scenario, a search box, shows both directions with each store: typing changes the store and starts a search; the result of the search changes the store.

## What Changes

- The shared block (`// name-bus.js`) becomes `// search-bus.js`: a bus with the actions `queryChanged` and `searchLoaded`, `emitQueryChanged = bus.emitter(queryChanged)`, and a handler `debounce(300, latest(...))` that calls `api.search(query, { signal })` and emits `searchLoaded(items)`.
- Every store subsection shows its own store with the fields `query` and `results` and both directions:
  1. **The store triggers the bus:** the `query` field is subscribed with `emitQueryChanged` (the line that is there today).
  2. **The bus triggers the store:** `bus.on(searchLoaded, (items) => ...)` writes `results` the way that store does it (Nanostores `set`, MobX `runInAction`, Valtio assignment, Jotai `store.set`, Zustand `setState`, Pinia assignment or `$patch`).
- A short intro of the section names the two directions ("the store triggers an event", "the event changes the store") with a sentence on loops: write `results`, never the field you watch (`query`).
- The Pinia subsection drops its own copy of the bus: it uses the shared block like the others and shows the `watch` line and the write-back. The subsection "Change the store from a handler" keeps only what the new subsections do not say (giving the store to every task with `createBus({ context })`, the MobX `flow` note).
- The table of contents of the page is updated if a heading changes. The Redux section is not touched.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. Documentation only, so the change sets `skip_specs: true`.

## Non-goals

- Anything in `src/`, the README, or other pages. The Redux section (user requested and loaded) is already a real case.
- Debounce and cancel details: the page links to [Policies](policies.md) and does not explain them again.
- A new store, a UI, or a test of the stores (their packages stay optional; Nanostores, Valtio, Pinia and Vue are stubs in `docs:check`).

## Impact

- `docs/stores.md` only (it has uncommitted edits from the change `framework-recipes`; this change builds on them and keeps the table of contents and the headings). `CHANGELOG.md`: the line of `framework-recipes` is reworded, no new line.
- `pnpm docs:check` checks the new snippets (MobX, Jotai and Zustand against their real types); `pnpm llms:check` is unaffected.
