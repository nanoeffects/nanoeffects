# Design

## Context

`react-ts` is the base: its `package.json`, `tsconfig.json`, `vite.config.ts` and files. `scripts/templates-check.mjs` writes a temporary `tsconfig` that extends the template's own, maps `nanoeffects/*` to `src`, runs `pnpm exec tsc`, and keeps only the errors in the template's files. It picks every `*-ts` directory, so `vue-ts` is picked up the moment it exists. Plain `tsc` cannot read `.vue` files. The repository has no `vue` and no `vue-tsc` today (they appear in the lockfile only as peers). `npm view` gives `vue@3.5.44`, `vue-tsc@3.3.13` (peer `typescript >=5.0.0`) and `@vitejs/plugin-vue@6.0.10`. See proposal.md for why.

## Goals / Non-Goals

**Goals:**
- A Vue developer sees how a bus, a `ref` and unmounting fit, in files they can keep.
- The `.vue` file is type-checked in the repository, so the template cannot rot.

**Non-Goals:**
- A `nanoeffects/vue` entry or any new API. A helper that a template owns can be changed by its reader; an entry cannot.
- Vue Router, Pinia, Nuxt, or a JavaScript twin.

## Decisions

- **One composable, `use-event-ref.ts`, owned by the template.** `useEventRef(event, initial)` returns a `Ref` typed from the event: `const found = useEventRef(searchLoaded, [])` is `Ref<string[]>` because `searchLoaded` is `createAction<string[]>`. Inside: `const state = ref(initial)`, `onScopeDispose(bus.on(event, (payload) => { state.value = payload }))`. `bus.on` returns the unsubscribe function, so passing it to `onScopeDispose` is the whole cleanup. Alternatives: `onMounted` plus `onUnmounted` (two hooks and a variable to hold the function) and a `nanoeffects/vue` entry (new public API, a new size limit, a new plugin matrix row; rejected for a first Vue starter).
- **`onScopeDispose` over `onUnmounted`.** It runs when the component unmounts and also when the composable is used in an effect scope that is not a component (a test, a store), so the helper does not depend on a component being the caller. Subscribing at call time in `setup`, not in `onMounted`, is what `bus.on` wants: the component renders once with the initial value and gets every event after setup. A comment says an event before `setup` runs is lost.
- **The type of the ref comes from the event.** The signature takes an `ActionCreator<P>` and `initial: P`, so the type check is the one the other templates show. A `ref` of an array returns `Ref<string[]>`; the helper unwraps nothing.
- **Emit from a `watch` on the query, not from an input handler.** A `watch` on a ref runs when its value changes and not on mount, so nothing is emitted until the user types, with no flag to remember. An `@input` handler next to `v-model` depends on which of the two listeners runs first, and a handler without `v-model` needs a cast of the event target in the template. `react-ts` needs `useEmitter` only because React offers no such shortcut.
- **The save-after-quiet part uses `withPolicy`, no new API.** In Vue `<script setup>` runs once per component, so `const save = withPolicy(debounce(1000, task))` is made once, which is the problem that `usePolicy` solves in React. `onScopeDispose(() => save.cancel())` cancels a pending save on unmount. A comment says why this is a plain call in Vue and a hook in React.
- **Files.** `index.html` (for `main.ts`), `package.json`, `tsconfig.json`, `vite.config.ts`, `src/env.d.ts` (the `*.vue` module shim), `src/main.ts`, `src/App.vue`, `src/Notes.vue`, `src/bus.ts`, `src/search.ts`, `src/search-handlers.ts`, `src/api.ts`, `src/use-event-ref.ts`, `_gitignore`. The bus file imports no events; the events file imports no bus.
- **TypeScript version of the template.** `vue-tsc` works through the JavaScript API of TypeScript, which the native TypeScript 7 does not have: `vue-tsc@3.3` fails with `ERR_PACKAGE_PATH_NOT_EXPORTED` for `typescript/lib/tsc` (the spike confirmed it). So `vue-ts` pins `typescript@^5.9` in its `package.json`; nothing else in the template depends on the version.
- **The check.** `templates-check.mjs` uses `vue-tsc` instead of `tsc` for a template that has a `.vue` file, with the same temporary `tsconfig` and the same filter on the template's files. This adds `vue`, `vue-tsc` and a `typescript-5` alias (`npm:typescript@^5.9.3`) to the dev dependencies of the repository, used by no other script: `scripts/vue-tsc.mjs` calls `vue-tsc` with the tsc of that alias, because the `typescript` of the repository is version 7. Alternatives: type-check only the `.ts` files with `tsc` and leave the `.vue` file to a manual scratch build (rejected: the component is where a type break would show, and the spec requires that `pnpm verify` catches it), or install the template from the packed tarball in a scratch directory in CI (accurate, but slow and needs `dist`; it stays a manual step before a release).
- **Docs.** `docs/starter.md` gets the row and one sentence: pick `vue-ts` for a Vue 3 app. The `llms.txt` starter line lists the template names, so it gets the new name. `docs/stores.md` already covers Vue and Pinia.

## Risks / Trade-offs

- [`vue-tsc` does not run with TypeScript 7] → the spike decides before any file is written; `vue-ts` pins TypeScript 5 for itself, and the repository check runs `vue-tsc` with the version it resolves.
- [A dev dependency on `vue-tsc` slows `pnpm install` and the check] → measured in the spike; the check runs only on templates that have a `.vue` file.
- [The composable looks like a library API that is missing] → the comment says it is the template's own, small on purpose, and that `useEventState` exists for React only; if more frameworks ask for the same, an entry is its own change.
- [The versions pinned in the template go stale] → the same as the other templates; the check and `pnpm consumer-check` before a release show it.

## Open Questions

- Whether `Notes.vue` stays: it is kept only if `withPolicy` reads clearly in it; decided while writing it, with no effect on the specs.
