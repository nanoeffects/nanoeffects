# Proposal

## Why

React has `reactPlugin`: `useEmitter` tells the bus when a value of a component changes, and `useEventState` keeps an event as state. A Vue developer has neither. The `vue-ts` starter carries a helper file of its own (`use-event-ref.ts`) and a hand-written `watch(query, (value) => bus.emit(queryChanged(value)))`, which every Vue project would copy and get slightly wrong (the options of `useEmitter` for equality and for the trace names are missing). Both are the same two jobs, and they belong in a plugin, as in React.

## What Changes

- A new entry `nanoeffects/vue` with `vuePlugin()`. `bus.use(vuePlugin())` returns the bus with two more methods, taken out by destructuring as `useEmitter` is:
  - `watchEmitter(source, event, options?)`: watches a `ref` or a getter and emits `event` with the new value when it changes, never on mount. `options` are `equals`, `traceId` and `traceGroupId`, as for `useEmitter`.
  - `useEventRef(event, initial)`: a `ref` that every `event` of the bus sets to its payload while the component lives, unsubscribed when its scope ends. The type comes from the event, or from `initial` when the event has no payload type, as for `useEventState`.
- `vue` is an optional peer dependency of that entry only, as `react` is for `nanoeffects/react`.
- The `vue-ts` template uses them: `bus.ts` gets `vuePlugin()`, and `use-event-ref.ts` and the hand-written `watch` go. It is not yet released, so nothing breaks.
- Docs: a short page `docs/vue.md`, a row in `docs/package.md`, a line in `llms.txt`, the Vue paragraph of `docs/starter.md`. `AGENTS.md` lists the entry. `CHANGELOG.md` under `Unreleased` (`### Added`).

Out of scope: a `usePolicy` for Vue (a policy made in `<script setup>` is made once, so `withPolicy` is enough), Nuxt, Pinia bindings, and `useEventRef` writing back to the bus.

**Release.** The template depends on the published `nanoeffects`, and `nanoeffects/vue` exists only from the release that carries this change. The release ships the entry and the template together.

## Capabilities

### New Capabilities
- `vue-entry`: the `nanoeffects/vue` entry, `vuePlugin`, `watchEmitter` and `useEventRef`.

### Modified Capabilities
- `starter-templates`: `vue-ts` reads its state through the entry and not through a helper of its own.

## Impact

- New `src/vue/` (plugin, tests, index), a small shared type in `src/core` for the type of the state of an event (moved out of `src/react/plugin.ts`, no change for React users).
- `package.json` (exports, peer dependency, size limit), `tsdown.config.ts`, root `tsconfig.json` (paths), `scripts/smoke.mjs`, `src/tests/architecture.test.ts`, `src/tests/plugin-matrix.test.ts`, `src/tests/exports.test.ts` if it lists entries.
- `docs/vue.md`, `docs/package.md`, `docs/starter.md`, `llms.txt`, `AGENTS.md`, `CHANGELOG.md`, `packages/create-nanoeffects/templates/vue-ts`.
- The size of `createBus` does not change: the entry is separate.
