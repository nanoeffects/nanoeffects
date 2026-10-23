# Design

## Context

Entries are built by `tsdown.config.ts`, mapped in `package.json` `exports`, `tsconfig.json` paths and `vitest.config.ts`, and sized by `size-limit`. A plugin is a function of the bus (`bus.use(plugin)`); `emitterPlugin` adds `bus.emitter` and `effectsPlugin` returns the bus typed with its fields. `emit` accepts an event name, an action or a command. Checked in a scratch project: emitting inside a reducer fires twice per click under StrictMode.

The tree already holds work for the dropped first version (`useStore`): the entry wiring, the dependencies, the architecture rule, the smoke change, the size item, and `src/react/use-store.ts` with its tests. Wiring and dependencies stay; the hook and its tests are replaced.

## Goals / Non-Goals

**Goals:**
- One hook that is correct about mount, StrictMode and a changing `emit`.
- A plugin form, so the hook knows its bus and an app exports it as a free function.
- Docs for the three real situations: plain React, a value read outside React, a store library.

**Non-Goals:**
- No own atom or store (`createAtom`): Nanostores, Jotai and Zustand do it; adapters for stores were removed on purpose.
- No `useOn` (bus to React) hook: `useEffect(() => bus.on(...), [])` is short; add it when it repeats.
- No updater-function or `useReducer` integration, no change to the Redux middleware.

## Decisions

1. **`reactPlugin()` adds `useEmitter` to the bus**, like `emitterPlugin` adds `emitter`. It returns the same bus typed with the method. Alternative rejected: a free `useEmitter(emit, value)`, which needs a separate `bus.emitter(...)` per event created once outside the component and cannot know its bus.
2. **A closure, not `this`.** The method closes over the bus passed to the plugin, so `export const { useEmitter } = bus` works. A test destructures it.
3. **Semantics:** a `ref` holds the previous value, initialised with the first value; a `useEffect` with `[value]` as its dependency compares with `equals` (default `Object.is`; `null` also means the default), updates the `ref` and emits. The third parameter exists for objects and arrays that are rebuilt on every set. Comparing with the `ref` (not a "first run" flag) makes the second effect run of StrictMode a no-op. The event and `equals` are kept in a `ref` too, so a new identity of either does not re-run the effect.
4. **Emitting:** a function `event` (action creator) emits `event(value)`; a string emits `bus.emit(event, value)`. Payload types follow the bus's own `emit` typing; `value` must match.
5. **Packaging** as in the first version: entry `react` in the first build only, `exports["./react"]` without `notrace`, optional peer `react >=18`, `unused.ignore` for the peer, smoke skips where React is absent, `size-limit` item with `ignore: ["react"]` (limit re-measured; it was 200 B for `useStore`).
6. **Docs** show three ways, because the case is "the value changes and several places react":
   - Context provider: `useState` plus one `useEmitter` call plus one `bus.on` effect for the result; consumers only read. The re-render of all consumers is noted, with split contexts as the fix.
   - A value store of about 12 lines on `useSyncExternalStore`, with `Object.is` in `set`, when a handler must read the value (through `contextPlugin`).
   - A Nanostores atom (`listen`, not `subscribe`, to skip the initial call) with `@nanostores/react`; other stores point to the sections above.
   - `useReducer` note: dispatch, then `bus.emit`, never inside the reducer.
7. **Tests** render a component with `createElement`, `react-dom/client` and `act` in `happy-dom`, under StrictMode, with a real bus.

## Risks / Trade-offs

- A bus method that is a hook looks unusual; the `use` prefix signals it and `react-hooks/rules-of-hooks` checks `bus.useEmitter(...)` calls by that prefix.
- Emission happens after commit, not at the `set` call; the docs say so, and a direct `emitter` call in the handler is the way to emit for an unchanged value.
- A hook bound to a bus cannot send to anything else; writing the effect by hand is the way out.
- The first-version work in the tree must be replaced, not left: a test fails if `useStore` is still exported by mistake.
