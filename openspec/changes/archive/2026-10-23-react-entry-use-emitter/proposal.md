# Proposal

## Why

A React component holds a value (a name, a query, a filter) that handlers on the bus must hear about when it changes. The obvious code, `useEffect(() => emit(value), [value])`, has three quiet traps: it emits on mount, it emits twice on mount under StrictMode, and `emit` in the dependencies re-runs it on every render when its identity is not stable. A reader should not rediscover them.

The first version of this change (`useStore`, a `useState` wrapper whose setter calls a callback) was dropped: it only saw its own setter, replaced `useState`, and shared a name with Zustand and Pinia. A hook that watches the value works with any source of the change.

## What Changes

- New entry `nanoeffects/react` with `reactPlugin()`. `bus.use(reactPlugin())` returns the same bus with one more method, `useEmitter(event, value)`, a React hook: after a render commits with a changed `value` (`Object.is`), it emits `event` with that value. Not on mount, not twice under StrictMode, always with the latest bus.
- The method is a closure over the bus, not a method that reads `this`, so an app exports it as a free hook: `export const { useEmitter } = bus`.
- `react` (>=18) is an optional peer dependency; no other entry imports it.
- `docs/stores.md`: replace the Redux "React: useDispatch as a source" subsection with "React: sharing a value across components" with three ways: `useEmitter` with a Context provider (plain React), a small `useSyncExternalStore` value for reads outside React, and a Nanostores atom with `listen(bus.emitter(...))`. A short `useReducer` note: never emit inside a reducer.
- Entry rows in `docs/package.md` and `llms.txt`, build, exports, `size-limit`, tests, `CHANGELOG.md`.

## Capabilities

### New Capabilities
- `react-entry`: the `nanoeffects/react` entry: the plugin, the `useEmitter` hook and how they are packaged.

### Modified Capabilities
- `docs-react-sources`: the Stores page shows React ways to share a value and emit its changes, not Redux `useDispatch`.

## Impact

- New: `src/react/` (plugin, tests), entry `nanoeffects/react` in `exports`, `tsdown.config.ts`, `tsconfig.json` paths, `vitest.config.ts` alias, a `size-limit` item.
- Changed: `package.json` (optional peer `react`, dev `react`, `react-dom`, `happy-dom`, `@types/react*`), `docs/stores.md`, `docs/package.md`, `llms.txt`, `CHANGELOG.md`, `scripts/docs-stubs.d.ts`, the main spec `docs-react-sources` (requirements and Purpose).
- `createBus` and `src/core` are untouched; the new entry has no `notrace` build.
- Part of this work is already in the tree for the dropped first version (entry wiring, dependencies, architecture rule, smoke, `src/react/use-store.ts`); tasks say what is kept and what is replaced.
