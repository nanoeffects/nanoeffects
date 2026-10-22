# Design

## Context

After `framework-recipes`, `docs/stores.md` has a table of contents, the Redux section, "Emit from a state manager" with a shared block `// name-bus.js` (exports `emitNameChanged`) and one `###` subsection per store, then "Callbacks on every change", "Stop watching a store" and "Change the store from a handler". `docs:check` writes a block under the file name given by its first-line comment, so subsections can import the shared block. MobX, Jotai and Zustand are installed (devDependencies) and checked with their types; Nanostores, Valtio, Pinia and Vue are stubs. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- A subsection reads on its own: it creates the store, wires both directions, and a reader can copy it.

**Non-Goals:**
- A tutorial on any of the stores. Each snippet uses the store as its own docs do and no more.

## Decisions

**1. A search box is the scenario.**
It is the case of the README and the playground, so the reader already knows the bus side (`debounce` + `latest` + `ctx.signal`). It has a natural pair of fields: `query` (the user writes it) and `results` (the handler writes it). Alternatives: a theme setting saved to a server (one direction only), a cart (more code than the stores need). Rejected.

**2. The shared block exports the pieces, not a store.**
`search-bus.js` exports `bus`, `searchLoaded` and `emitQueryChanged`. The handler stays in that block. It ends with `ctx.emit(searchLoaded(items))`; nothing in it knows about any store. Each subsection imports what it needs. This keeps the store code as short as the store itself.

**3. Both directions, always in the same order.**
Each subsection has the same shape: create the store; `query` → bus (`emitQueryChanged`); bus → `results` (`bus.on(searchLoaded, ...)`). The second call returns the unsubscribe function like any `bus.on`; the sentence that comes after the subsections ("Stop watching a store") says to stop both.

**4. The writes follow each store's own idiom.**
Nanostores `$results.set(items)`; MobX `runInAction(() => { state.results = items })` (strict mode); Valtio `state.results = items`; Jotai `store.set(resultsAtom, items)`; Zustand `useSearchStore.setState({ results: items })`; Pinia `search.results = items` (or `$patch`). Checked against each library's docs while writing; no version-specific features.

**5. Loops are said once.**
A handler that writes the field the store watches would call itself again. The intro of the section says: write `results`, not `query`; the subsections do not repeat it.

**6. The subsection "Change the store from a handler" shrinks.**
Its main message (the other direction) now lives in every store subsection. What stays: `createBus({ context: { store } })` for giving the store to every task, and the MobX `flow` cancellation. It is renamed only if the new text no longer fits its title.

## Risks / Trade-offs

- [The page is longer: six full snippets with two directions] → each is about 15 lines; the shared block and the intro carry the explanation, the subsections carry code and one sentence.
- [An idiom is wrong for one store] → `docs:check` validates MobX, Jotai and Zustand against real types; for Nanostores, Valtio and Pinia the writes are the plainest documented ones; the review in task 3 reads each against the store's docs.
- [The file has edits of another change] → this change builds on them and does not revert any; it is applied after `framework-recipes` is accepted (its tasks are done).

## Open Questions

- None. ("Trigger of a store" in the request is read as both directions: the store triggers the bus, and the bus triggers the store; the page shows both.)
