# Proposal

## Why

The starters cover vanilla DOM, React and Vue. A Svelte developer finds nothing, and Svelte differs from the other two in a useful way: its stores are a plain contract, an object with `subscribe`, and `$store` in a template subscribes and unsubscribes for the component. The bus fits that contract without any code from nanoeffects.

## What Changes

- `create-nanoeffects` gets the template `svelte-ts` (Vite, Svelte 5 and TypeScript): the search app of `react-ts`. `npm create nanoeffects@latest my-app -- --template svelte-ts`.
- No new `nanoeffects` entry. The template has one small helper of its own, `eventStore(event, initial)`: a Svelte `readable` that starts listening to the event when something subscribes and stops when the last subscriber leaves, so `{#each $found as title}` needs no cleanup. The query goes to the bus from the `oninput` handler, so nothing is emitted on mount.
- The repository type-checks the template, including its `.svelte` files, as part of `pnpm verify`. `svelte-check` does not run with the TypeScript 7 of the repository, so it lives in a small workspace package, `tools/svelte-check`, with TypeScript 5.
- Docs: a row in the templates table and a short paragraph in `docs/starter.md`. `CHANGELOG.md` under `Unreleased`.

Out of scope: a `nanoeffects/svelte` entry (the store contract needs none; it can follow if the helper proves useful), a JavaScript Svelte template, SvelteKit, and a runes-based helper (`createSubscriber` needs `svelte` as a peer dependency of the library).

**Release.** The template depends on the published `nanoeffects` as the others do. It uses only entries that exist in 0.20.0, so it needs no new release of the library; it ships with the next release of the package.

## Capabilities

### New Capabilities

### Modified Capabilities
- `starter-templates`: the `svelte-ts` template, and the check that covers it.

## Impact

- `packages/create-nanoeffects`: `index.js` (the list), `index.test.js`, `templates/svelte-ts/`.
- `scripts/templates-check.mjs` (a template with `.svelte` files is checked with `svelte-check`), `tools/svelte-check/` (new workspace package), `pnpm-workspace.yaml`, `pnpm-lock.yaml`.
- `docs/starter.md`, `llms.txt`, `CHANGELOG.md`.
- No change to the `nanoeffects` package or its size.
