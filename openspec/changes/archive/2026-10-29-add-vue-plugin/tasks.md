# Tasks

## 1. The plugin

- [x] 1.1 Move the type that gives the state of an event its type (`StateOf` and `Widen`) from `src/react/plugin.ts` into a small file of `src/core` and import it in both entries. Verify with `pnpm tsgo` and `pnpm vitest run src/react`.
- [x] 1.2 Create `src/vue/plugin.ts` and `src/vue/index.ts`: `vuePlugin()` adds `watchEmitter(source, event, options?)` and `useEventRef(event, initial)` with the three overloads of `useEmitter`, the options `equals`, `traceId` and `traceGroupId` (the emit goes through `originKey` when it is set), a `shallowRef` and `onScopeDispose(bus.on(...))`, and a doc comment with an `@example` on each. Verify with `pnpm tsgo`.
- [x] 1.3 Tests in `src/vue/plugin.test.ts` with `effectScope`, `ref` and `nextTick`: a change emits once, nothing on mount, an equal value with `equals`, stopped with the scope, a trace name with `tracePlugin` and ignored without it, the free methods from destructuring; an event sets the ref, a function payload is stored, an emit before the call and after the scope is lost, the listener is removed with the scope. Types in `src/tests/types.test.ts`: the type of the ref from the event and from `initial`, a wrong value and a wrong initial rejected with `@ts-expect-error`. Verify with `pnpm vitest run src/vue src/tests/types.test.ts` and `pnpm tsgo`.

## 2. The package

- [x] 2.1 Wire the entry: `./vue` in `exports`, `vue` as an optional peer dependency (`>=3.3`), an entry in `tsdown.config.ts` with `vue` ignored by the unused check, a `size-limit` item that ignores `vue`, `nanoeffects/vue` in the paths of the root `tsconfig.json`, the smoke test (skipped where `vue` is missing), the architecture test (only `src/vue` imports `vue`) and a `vuePlugin` installer with a probe in `src/tests/plugin-matrix.test.ts`. Check `src/tests/exports.test.ts` for a list of entries. Verify with `pnpm build`, `pnpm size`, `pnpm smoke`, `pnpm lint:package` and `pnpm vitest run src/tests`.

## 3. Template and docs

- [x] 3.1 Switch `packages/create-nanoeffects/templates/vue-ts` to the plugin: `vuePlugin()` in `bus.ts`, `watchEmitter` and `useEventRef` in `App.vue` with the not-a-store comment, and no `use-event-ref.ts`. Update `index.test.js` (the files of `vue-ts` are those of `react-ts` with `.vue` for the components) and `docs/starter.md`. Verify with `pnpm templates:check` and `pnpm vitest run packages/create-nanoeffects`.
- [x] 3.2 Write `docs/vue.md`, add the entry to `docs/package.md`, `llms.txt`, `AGENTS.md` (the layout and the entries) and `CHANGELOG.md` under `Unreleased` (`### Added`). Verify with `pnpm docs:check` and `pnpm llms:check`.

## 4. Integration

- [x] 4.1 Run `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm templates:check && pnpm vitest run && pnpm build && pnpm smoke && pnpm lint:package && pnpm size`. Pack the package, make `vue-ts` into a scratch directory, install and build it, and open it in a browser: typing sends one request and the result appears. Verify all pass.
