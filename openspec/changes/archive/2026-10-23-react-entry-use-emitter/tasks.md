# Tasks

## 1. The plugin and its tests

- [x] 1.1 Dependencies: `react`, `react-dom`, `happy-dom`, `@types/react`, `@types/react-dom` (dev) and the optional peer `react >=18` (kept from the first version).
- [x] 1.2 Replace `src/react/use-store.ts` with `src/react/plugin.ts`: `reactPlugin()` returns the bus with `useEmitter(event, value, equals?)` (closure over the bus, `ref` of the previous value, `Object.is`, latest event in a `ref`); a doc comment with an `@example`; `src/react/index.ts` re-exports only `reactPlugin`.
- [x] 1.3 Replace `src/react/use-store.test.ts` with `src/react/plugin.test.ts`: a change emits once (also in StrictMode); no emit on mount; an equal value emits nothing; several sets before one commit emit once with the last; a string event and an action creator; `const { useEmitter } = bus` works; a new event identity does not emit; a custom `equals` (equal objects emit nothing, different ones emit once); names in full.
- [x] 1.4 Replace the `useStore` cases of `src/tests/types.test.ts` with cases for `bus.use(reactPlugin())`: the method exists, `value` must match the payload, a wrong type is a `@ts-expect-error`.
- [x] 1.5 Architecture test: only `src/react` imports `react` (kept).

## 2. Packaging

- [x] 2.1 `tsdown.config.ts`, `exports["./react"]`, `tsconfig.json` paths, `vitest.config.ts` alias, `unused.ignore` for the peer (kept).
- [x] 2.2 `size-limit` item `react`: re-measure after the plugin replaces the hook and set the limit.
- [x] 2.3 `scripts/smoke.mjs`: check `typeof reactEntry.reactPlugin === "function"` instead of `useStore`; run `pnpm smoke` and `node scripts/smoke.mjs --notrace`.
- [x] 2.4 `pnpm lint:package` passes for the export; no module of another entry imports `react` (kept; re-run at the end).

## 3. Docs

- [x] 3.1 `docs/stores.md`: replace the "React: useStore as a source" subsection with "React: sharing a value across components": Context provider with `useEmitter`; the `useSyncExternalStore` value and `contextPlugin`; the Nanostores atom; the `useReducer` note; update "On this page".
- [x] 3.2 `docs/package.md` row and `llms.txt` entry list: `nanoeffects/react` (`reactPlugin`, `useEmitter`).
- [x] 3.3 `CHANGELOG.md`: replace the `useStore` line of `Unreleased`.
- [x] 3.4 When archiving, fix the Purpose line of `openspec/specs/docs-react-sources/spec.md`.

## 4. Verify

- [x] 4.1 `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm vitest run && pnpm build`, then `pnpm verify`; the new docs blocks are not skipped.
