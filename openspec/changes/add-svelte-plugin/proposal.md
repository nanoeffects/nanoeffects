# Proposal

## Why

React has `reactPlugin` and Vue has `vuePlugin`, but Svelte has nothing: the `svelte-ts` starter carries a helper file of its own, `src/event-store.ts`, that makes a Svelte store from an event with `readable` and `bus.on`. Every Svelte project would copy that file, and its comment about "not a store of the app" with it. It is the same job that `useEventState` and `useEventRef` do, so it belongs in a plugin, as in the other two frameworks.

## What Changes

- A new entry `nanoeffects/svelte` with `sveltePlugin()`. `bus.use(sveltePlugin())` returns the bus with one more method, taken out by destructuring as `useEmitter` and `useEventRef` are:
  - `eventStore(event, initial)`: a readable Svelte store whose value is `initial` at first and the payload of every `event` after that. The bus listens only while something subscribes to the store (the first subscriber starts it, the last one stops it). The type comes from the event, or from `initial` when the event has no payload type, as for `useEventState` and `useEventRef`.
- `svelte` is an optional peer dependency of that entry only, as `react` and `vue` are for their entries. The entry imports `svelte/store` and nothing else.
- The `svelte-ts` template uses it: `bus.ts` gets `sveltePlugin()`, and `event-store.ts` goes. `App.svelte` keeps its `eventStore(searchLoaded, [])` call, imported from `./bus`.
- Docs: a short page `docs/svelte.md`, a row in `docs/package.md`, a line in `llms.txt`, the Svelte paragraph of `docs/starter.md`. `AGENTS.md` lists the entry. `CHANGELOG.md` under `Unreleased` (`### Added`).

Out of scope: a `watchEmitter` or `useEmitter` for Svelte (the `oninput` handler already emits, and a `$state` rune effect is not needed for the starter), a `writable` store that writes back to the bus, runes-based API (`$state`, `$derived`) and SvelteKit.

**Release.** `svelte-ts` was released in 0.21.0 with its own helper and depends on the published `nanoeffects`. `nanoeffects/svelte` exists only from the release that carries this change, so the release ships the entry and the new template together. Projects made from the 0.21.0 template keep working: their helper does not depend on the entry.

## Capabilities

### New Capabilities
- `svelte-entry`: the `nanoeffects/svelte` entry, `sveltePlugin` and `eventStore`.

### Modified Capabilities
- `starter-templates`: `svelte-ts` reads its state through the entry and not through a helper of its own.

## Impact

- New `src/svelte/` (plugin, tests, index). The shared type of the state of an event already lives in `src/core/state-of.ts`.
- `package.json` (exports, optional peer dependency, `svelte` as a dev dependency, size limit), `tsdown.config.ts`, root `tsconfig.json` (paths), `scripts/smoke.mjs`, `src/tests/architecture.test.ts`, `src/tests/plugin-matrix.test.ts`, `src/tests/types.test.ts`, `src/tests/exports.test.ts` if it lists entries.
- `docs/svelte.md`, `docs/package.md`, `docs/starter.md`, `llms.txt`, `AGENTS.md`, `CHANGELOG.md`, `packages/create-nanoeffects/templates/svelte-ts` and its test in `index.test.js`.
- The size of `createBus` does not change: the entry is separate.
