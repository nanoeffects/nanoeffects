# Tasks

## 1. The plugin

- [x] 1.1 Add `svelte` as a dev dependency of the repository (`pnpm add -D svelte`) so `svelte/store` resolves in `src` and in tests. Verify with `pnpm tsgo`.
- [x] 1.2 Create `src/svelte/plugin.ts` and `src/svelte/index.ts`: `sveltePlugin()` adds `eventStore(event, initial)` with the three overloads of `useEventRef`, built on `readable` and `bus.on`, with a doc comment and an `@example`. Verify with `pnpm tsgo`.
- [x] 1.3 Tests in `src/svelte/plugin.test.ts`: the value follows the event, listening only between the first subscription and the last unsubscription, an event while nothing reads is lost, a function payload is stored and not called, the free method from destructuring. Types in `src/tests/types.test.ts`: the type of the store from the event and from `initial`, a wrong `initial` rejected with `@ts-expect-error`. Verify with `pnpm vitest run src/svelte src/tests/types.test.ts` and `pnpm tsgo`.

## 2. The package

- [x] 2.1 Wire the entry: `./svelte` in `exports`, `svelte` as an optional peer dependency (`>=5`), an entry in `tsdown.config.ts` with `svelte` ignored by the unused check, a `size-limit` item that ignores `svelte`, `nanoeffects/svelte` in the paths of the root `tsconfig.json`, the smoke test (skipped where `svelte` is missing), the architecture test (only `src/svelte` imports `svelte`) and a `sveltePlugin` installer with a probe in `src/tests/plugin-matrix.test.ts`. Check `src/tests/exports.test.ts` for a list of entries. Verify with `pnpm build`, `pnpm size`, `pnpm smoke`, `pnpm lint:package` and `pnpm vitest run src/tests`.

## 3. Template and docs

- [x] 3.1 Switch `packages/create-nanoeffects/templates/svelte-ts` to the plugin: `sveltePlugin()` and `eventStore` in `bus.ts`, `App.svelte` imports it from `./bus` with the not-a-store comment next to the call, and no `event-store.ts`. Update `index.test.js` (one file less among those that differ from `react-ts`, and `bus.ts` contains `sveltePlugin`). Verify with `pnpm templates:check` and `pnpm vitest run packages/create-nanoeffects`.
- [x] 3.2 Write `docs/svelte.md`, add the entry to `docs/package.md`, update the `svelte-ts` paragraph of `docs/starter.md`, add the line to `llms.txt`, the layout and entries to `AGENTS.md`, and `CHANGELOG.md` under `Unreleased` (`### Added`). Verify with `pnpm docs:check` and `pnpm llms:check`.

## 4. Integration

- [x] 4.1 Run `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm templates:check && pnpm vitest run && pnpm build && pnpm smoke && pnpm lint:package && pnpm size`. Pack the package, make `svelte-ts` into a scratch directory, install and build it, and open it in a browser: typing sends one request and the result appears. Verify all pass.
