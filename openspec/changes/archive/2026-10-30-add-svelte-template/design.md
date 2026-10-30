# Design

## Context

`vue-ts` is the nearest model: a template with its own check through `vue-tsc`, run with TypeScript 5 by `scripts/vue-tsc.mjs` because the repository has TypeScript 7. A Svelte store is any object with `subscribe(run)` that returns an unsubscribe function; `readable(initial, start)` from `svelte/store` makes one, calls `start(set)` when the first subscriber arrives and the function that `start` returns when the last one leaves. `bus.on` returns an unsubscribe function. See proposal.md for why.

## Goals / Non-Goals

**Goals:**
- The Svelte idiom, `$store` in the template, with nothing for the reader to clean up.
- The `.svelte` files checked in the repository.

**Non-Goals:**
- A library entry, SvelteKit support, or runes in the helper.

## Decisions

- **A store, not runes, for the event.** `readable(initial, (set) => bus.on(event, set))` is the whole helper. It has no dependency on a Svelte version beyond `svelte/store`, which is the same in Svelte 3, 4 and 5, and it listens only while a component reads it: the subscription is made on the first `$found` and removed with the last one. A rune version needs `createSubscriber` from `svelte/reactivity` and is the better shape for a library entry that has `svelte` as a peer dependency; this template needs no entry, so it does not use it.
- **The helper's type.** `eventStore<P>(event: ActionCreator<P, string>, initial: P)` returns `Readable<P>`; the type of `found` is `string[]` from `createAction<string[]>`. A function payload is stored, since `set` takes a value, not an updater.
- **Emit from the input handler.** `oninput={(event) => bus.emit(queryChanged(event.currentTarget.value))}`: no emit on mount, no store for the query, and `event.currentTarget` is typed by Svelte. The state of the input itself needs no variable.
- **The save-after-quiet part is `withPolicy`.** `<script>` of a component runs once, so `withPolicy(debounce(...))` is made once, as in `vue-ts`; `onDestroy(() => save.cancel())`. The `oninput` handler calls `save(event.currentTarget.value)`, so no effect runs on mount.
- **Files.** `index.html`, `package.json` (`svelte`, `@sveltejs/vite-plugin-svelte`, `svelte-check`, `typescript` 5, `vite`; `build` is `svelte-check && vite build`), `svelte.config.js`, `tsconfig.json`, `vite.config.ts`, `src/main.ts`, `src/App.svelte`, `src/Notes.svelte`, `src/bus.ts`, `src/search.ts`, `src/search-handlers.ts`, `src/api.ts`, `src/event-store.ts`. The bus file imports no events; the events file imports no bus.
- **The check.** `tools/svelte-check` is a private workspace package with `svelte`, `svelte-check` and `typescript@5`; `templates-check.mjs` runs its `svelte-check` binary for a template that has a `.svelte` file, with the same temporary `tsconfig` (paths to `src`) and the same filter on the template's files. Why a workspace package and not an alias, as for `vue-tsc`: `svelte-check` finds TypeScript through its own peer dependency, which an alias in the root cannot change. A spike confirmed that this runs, finds a wrong type in a `.svelte` file and accepts runes. Alternatives: skip the check for `.svelte` files (rejected, as for Vue), or install into a temporary directory on each run (slow, needs the network).
- **Docs.** `docs/starter.md` gets the row and one paragraph. The Svelte store pattern is not a docs page of its own.

## Risks / Trade-offs

- [`svelte-check` and the template drift to a Svelte version that changes the typing] → the check runs in `pnpm verify` against the versions of the workspace package; the template pins its own.
- [The store is read from a module that keeps the bus on a server] → SvelteKit is out of scope, and the template is a Vite client app.
- [A second workspace package adds install time] → it holds three dependencies and no scripts.

## Open Questions

None that change the specs.
