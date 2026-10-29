# Proposal

## Why

The starter templates of `create-nanoeffects` are plain JavaScript. A TypeScript project has to retype them, and cannot see the main typed idea of the library: an event made with `createAction<Payload>` carries its type, so `useEventState(searchLoaded, [])` and the handlers know the payload with no event map and no annotation in the component. In JavaScript the same code is `unknown` (see `add-use-event-state`).

## What Changes

- `create-nanoeffects` gets two more templates, `vanilla-ts` and `react-ts` (Vite + TypeScript), next to `vanilla` and `react`. `npm create nanoeffects@latest my-app -- --template react-ts` makes one; the template question lists all four names.
- The JavaScript templates and the default (`vanilla`) do not change.
- A TS template has the same files as its JS twin, one job each (`bus.ts`, `search.ts`, `search-handlers.ts`, `api.ts`, and for React `App.tsx`, `Notes.tsx`, `main.tsx`), plus `tsconfig.json` and, for React, `vite.config.ts`. Events are made with `createAction<Payload>("name")`, so the state of `useEventState` and the arguments of handlers are typed from the events. `npm run build` type-checks (`tsc --noEmit`) before `vite build`.
- A check in the repository type-checks both TS templates against the sources of `nanoeffects` (the same `paths` mapping the docs use), so a change in the types cannot break a starter silently.
- Docs: `docs/starter.md` (templates table, files table, when to pick TypeScript), `CHANGELOG.md`.

Out of scope: a `--typescript` flag that converts a template, more frameworks, linting or test setup in the templates.

## Capabilities

### New Capabilities

### Modified Capabilities
- `starter-templates`: the TypeScript templates, and the rule that the templates are checked from the repository.

## Impact

- `packages/create-nanoeffects`: `index.js` (the list of templates), `index.test.js`, `templates/vanilla-ts/` and `templates/react-ts/`.
- A script or test in the repository that type-checks the TS templates; `biome.json` already ignores `packages/*/templates`.
- `docs/starter.md`, `CHANGELOG.md`. `llms.txt` changes only if the starter line names the templates.
- No change to the `nanoeffects` package or its size.
- The specs `starter-templates` and `create-starter` come from the change `add-create-nanoeffects`, which is not archived yet: archive it first, so this delta applies to a spec that exists.
