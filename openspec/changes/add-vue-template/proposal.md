# Proposal

## Why

The starters cover vanilla DOM and React. `nanoeffects` has no React in its core, and its pitch is that the bus lives outside the UI, but a Vue developer who runs `npm create nanoeffects` finds nothing for their framework and has to guess how a bus, a ref and unmounting fit together. The tool is the same; the missing piece is the 20 lines that connect it to Vue's lifecycle.

## What Changes

- `create-nanoeffects` gets the template `vue-ts` (Vite, Vue 3 and TypeScript with `<script setup lang="ts">`). `npm create nanoeffects@latest my-app -- --template vue-ts`. The other templates and the default `vanilla` do not change.
- The template is the search app of `react-ts`: a text box, `debounce` and `latest` in the handler, a fake server that honors the signal, and a small part with a debounced save in a component. The files follow `react-ts` (`bus.ts`, `search.ts`, `search-handlers.ts`, `api.ts`, `App.vue`, `main.ts`), and the events carry their types with `createAction<Payload>`.
- No new `nanoeffects` API and no new entry. The template has one small composable of its own, `useEventRef(event, initial)`, which keeps the last payload of an event in a `ref` and unsubscribes when the component unmounts. It is the Vue counterpart of `useEventState`, written in the template where the reader can read and change it. A comment says that it is not a global store, that an event before the mount is lost, and that a value which must outlive the component belongs in a store (Pinia) or a `provide` at the root.
- The repository type-checks the template, including its `.vue` file, as part of `pnpm verify`.
- `docs/starter.md`: a row in the templates table and one sentence on when to pick it. `CHANGELOG.md` under `Unreleased`.

Out of scope: a `nanoeffects/vue` entry, a JavaScript Vue template, Nuxt, Pinia in the template, and a Vue docs page.

## Capabilities

### New Capabilities

### Modified Capabilities
- `starter-templates`: the `vue-ts` template, and the check that covers it.

## Impact

- `packages/create-nanoeffects`: `index.js` (the list of templates), `index.test.js`, `templates/vue-ts/`.
- `scripts/templates-check.mjs`: it picks every `*-ts` template and type-checks it with `tsc`, which cannot read a `.vue` file; it must use `vue-tsc` for a template that has one.
- Dev dependencies of the repository: `vue`, `vue-tsc` and a `typescript-5` alias (only for the check): `vue-tsc` does not run with the TypeScript 7 of the repository.
- `docs/starter.md`, `CHANGELOG.md`. `llms.txt` has the template names in the starter line and is updated with them. `docs/stores.md` already has a Vue and Pinia recipe and is not changed.
- No change to the `nanoeffects` package or its size.
