# Proposal

## Why

`useEffect(() => bus.on(searchLoaded, setFound), [])` is written in many components: it keeps the last payload of an event as React state. Each copy repeats the same traps (a forgotten unbind, a payload that is a function and runs as an updater, a stale `useState` initial) and the reader has to see a `useState` and a `useEffect` as one idea. `useEmitter` already sends a value from a component to the bus; the way back has no hook.

## What Changes

- `reactPlugin` adds `bus.useEventState(event, initial)`. It has the signature of `useState`: it returns `[state, setState]`, `initial` may be a function (lazy, as in `useState`), and `setState` is the one of React. The state is set to the payload of every `event` while the component is mounted.
- `event` is an event name of the bus or an action creator (the same three overloads as `useEmitter`); the state type is the payload type of the event.
- When the payload type of the event is unknown (the bus has no event map, or the creator has no type, as in plain JavaScript), the state type comes from `initial`, so `useEventState(searchLoaded, ["a"])` is `string[]` and not `unknown`. An empty `[]` is `unknown[]`. When the payload type is known, nothing changes: the state is that type and a wrong `initial` is rejected.
- The method is a closure over the bus, so `export const { useEventState } = bus` gives a free hook, as `useEmitter` does.
- The `react` template of `create-nanoeffects` uses the hook instead of `useEffect(() => bus.on(...))`.
- Docs: a section in `docs/react.md` (JS first, each call commented), the line in `llms.txt` for the entry, and `CHANGELOG.md` under `Unreleased`.

Out of scope: a reducer form (`useEventState(event, initial, reduce)`), replay of the last event (the bus keeps no values), tracing options. Each can be added later without breaking this API.

## Capabilities

### New Capabilities

### Modified Capabilities
- `react-entry`: the plugin also adds `useEventState`, with its own subscription rules.

## Impact

- `src/react/plugin.ts` (+ `plugin.test.ts`), `src/tests/types.test.ts` (inference of the state type, also from `initial`, and wrong calls).
- `packages/create-nanoeffects/templates/react` (`App.jsx`, `bus.js`).
- Docs: `docs/react.md`, `docs/starter.md`, `llms.txt`, `CHANGELOG.md`.
- `createBus` is not touched. The `react` entry grows by a few dozen bytes: the limit in `package.json` (1.18 kB) is re-measured and raised only by that amount.
