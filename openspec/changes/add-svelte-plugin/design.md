# Design

## Context

`vuePlugin` (`src/vue/plugin.ts`) is the model: a plugin that adds methods to the bus as closures, so `export const { useEventRef } = bus` works; an optional peer dependency; an entry with its own `size-limit`, no `notrace` build, skipped by `scripts/smoke.mjs` when the framework is missing, and imported only by its own `src` folder (checked by `src/tests/architecture.test.ts`). The `svelte-ts` template (released in 0.21.0) has the same job in a helper, `src/event-store.ts`: `readable(initial, (set) => bus.on(event, set))`. `svelte` is not a dev dependency of the repository: it lives in `tools/svelte-check`, which `scripts/templates-check.mjs` uses. See proposal.md for why.

## Goals / Non-Goals

**Goals:**
- The helper of the template, moved into a plugin, with the same behavior and the same warning that it is not a store of the app.
- Nothing is added to a project that does not use Svelte.

**Non-Goals:**
- A `watchEmitter` for Svelte, a writable store that writes back, runes (`$state`, `$derived`), SvelteKit.

## Decisions

- **One method, `eventStore`, on the bus.** The same shape as the other two plugins, so the bus file reads the same in each framework: `export const { eventStore } = bus`. The name stays the one the template already uses, so `App.svelte` changes only its import.
- **`readable` from `svelte/store`, not a hand-made store.** `readable(initial, (set) => bus.on(event, set))` already gives the contract: the function runs at the first subscriber and the function it returns (the unsubscribe that `bus.on` returns) runs at the last one. `svelte/store` is the one import of the entry. A function payload goes through `set` as a value, which `readable` stores without calling, so no wrapper is needed. Store-contract details (`subscribe` calls the subscriber at once with the current value) come from Svelte and are not restated.
- **The bus does not keep values.** An event emitted while nothing subscribes is lost, as in `useEventState` and `useEventRef`. The doc comment, `docs/svelte.md` and the template comment say so; this is the content of the existing "not a store of the app" requirement and it moves with the code.
- **Types.** The three overloads of `useEventRef` (an event name of the map, a creator with no payload type, a creator with a payload type), returning `Readable<StateOf<E[K], S>>` or `Readable<P>`. `StateOf` already lives in `src/core/state-of.ts`, so nothing moves.
- **An optional peer dependency `>=5`.** The template is Svelte 5, and the store contract is unchanged from 3 and 4; but `>=3.3` would promise tests that nobody runs. The tests run on the Svelte 5 of the repository. If the owner wants a wider range, the code does not change.
- **`svelte` becomes a dev dependency of the repository** (as `vue` did), so `src/svelte` tests and `tsgo` resolve `svelte/store`. `tools/svelte-check` stays: it exists because `svelte-check` does not run with TypeScript 7.
- **Package wiring as for Vue.** `exports` has `./svelte`, `tsdown.config.ts` has an entry and `svelte` is ignored by its unused check, `peerDependencies` and `peerDependenciesMeta` have `svelte` (optional), `size-limit` has an entry that ignores `svelte`, the root `tsconfig.json` maps `nanoeffects/svelte` to `src`, `smoke` imports the entry only where `svelte` is installed, the architecture test lets only `src/svelte` import `svelte`, and the entry has no `notrace` build.
- **The matrix.** `plugin-matrix.test.ts` gets `sveltePlugin` as a plugin with a probe that `eventStore` is on the bus and follows an event, in every order.
- **The template.** `bus.ts` of `svelte-ts` uses `sveltePlugin()` and takes out `eventStore`; `event-store.ts` goes; `App.svelte` imports `eventStore` from `./bus` and gets the not-a-store comment next to the call (it moves from the helper). `index.test.js` expects one file less (`event-store`) among the files that differ from `react-ts`, and checks that `bus.ts` contains `sveltePlugin`.
- **Docs.** One page, `docs/svelte.md`, built like `docs/vue.md`: the problem, what `eventStore` does, the not-a-store limit, a pointer to the starter. It is linked from `docs/package.md`, `docs/starter.md` and `llms.txt`. The `svelte-ts` paragraph of `docs/starter.md` stops saying that no part of nanoeffects is needed for Svelte.

## Risks / Trade-offs

- [`svelte-ts` is made before the release and does not compile] → the release ships the entry and the template together; `templates:check` type-checks the template against `src`. Existing projects keep their own helper.
- [A third framework entry keeps three things in step] → `StateOf` is one definition and the tests of the three entries state the same rules.
- [A store that listens only while read surprises a reader] → the same limit as the other two entries, named in the doc comment, the docs and the template.
- [`svelte` as a dev dependency next to `tools/svelte-check`] → two copies of Svelte in the repository; the tool one is only for `svelte-check`, and a mismatch shows as a failing `templates:check`.

## Open Questions

- Peer range: `>=5` as above, or wider. No spec depends on it.
