# Proposal

## Why

The starters show one handler on a bus. The docs teach a second step, level D: the domain logic lives off the UI as commands, jobs and modules, split by domain (`docs/actions.md`), but no starter shows what that project looks like. A reader who has the search box running has no template to grow it into an app with more than one feature. This change adds one: a TypeScript project in which each domain is a folder with its events, its handlers and a module, and React is a thin layer.

## What Changes

- `create-nanoeffects` gets the template `domains-ts` (Vite + React + TypeScript). `npm create nanoeffects@latest my-app -- --template domains-ts`. The other templates and the default `vanilla` do not change.
- The template has two small domains with a real flow, under `src/domains/`:
  - `catalog`: searching products. An action for the result, a command for the lookup, a handler under `debounce` and `latest`.
  - `checkout`: placing an order. A job (`createJob`) under `leading` and `retry`, whose `pending`, `success`, `fail` and `cancel` drive a small store; the UI reads `status` and `error` from it.
- Each domain folder has an events file (`createAction<Payload>`, `createCommand`, `createJob`; imports no bus), a handlers file (knows the bus and the events) and a module (`createModule`) that mounts the handlers. `src/bus.ts` holds only the bus and its plugins and imports no events; `src/app.ts` mounts the modules.
- React stays thin: components call a command or emit an action and read values. The found products come to a Context provider at the root through one `useEventState`, with a comment that it is not a global store and an event before the mount is lost; the checkout status comes from the domain's own store through `useSyncExternalStore`.
- `docs/starter.md`: a row in the templates table, the layout of the domain folders, and when to pick the template. A short section of `docs/actions.md` links the template as the project-sized version of its modules recipe.
- `CHANGELOG.md` under `Unreleased`.

Out of scope: a JavaScript twin, a router, tests inside the template, a persistence layer, any new API of `nanoeffects`.

## Capabilities

### New Capabilities

### Modified Capabilities
- `starter-templates`: the `domains-ts` template, its layout, and its place in the checks of the repository.
- `create-starter`: the template question and the unknown-template message list the new name.

## Impact

- `packages/create-nanoeffects`: `index.js` (the list of templates), `index.test.js`, `templates/domains-ts/`.
- `scripts/templates-check.mjs` already type-checks every `*-ts` template: the new one is covered once its directory exists (to be verified).
- `docs/starter.md`, `docs/actions.md`, `CHANGELOG.md`. `llms.txt` changes only if a page is added (none planned).
- No change to the `nanoeffects` package or its size.
- The template uses the types of `createCommand`, `createJob`, `createModule` and `modulePlugin` as released; if one of them cannot be typed without an event map, that is found in the check and raised as a separate change, not worked around in the template.
