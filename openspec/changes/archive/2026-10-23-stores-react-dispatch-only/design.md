# Design

## Context

The subsection sits in "Emit from a state manager" of `docs/stores.md`, before "Callbacks on every change". It has an intro, a `useState` paragraph and block (`search-state.jsx`), a `useDispatch` paragraph and block (`search-redux.jsx`), and a closing sentence about using both. The blocks are independent: the Redux block defines its own bus, slice and store.

## Goals / Non-Goals

**Goals:**
- A page about stores shows only store-backed sources.
- Nothing else in the docs depends on the removed text.

**Non-Goals:**
- No change to the `useDispatch` example, to the React playground (it keeps `useState`), or to `docs/react.md`.
- No `bus.emitter` variant: the Redux case needs no emitter, because the middleware sends actions to the bus.

## Decisions

1. **Rename to "React: useDispatch as a source"** and keep its place in the list. The intro keeps its first sentence, reworded to Redux only.
2. **The main spec Purpose is edited by hand when the change is archived**, because a delta cannot change a Purpose: it names `useState`.
3. **CHANGELOG:** edit the existing `Unreleased` line instead of adding one, since the feature was never released.

## Risks / Trade-offs

- A reader who wants the `useState` recipe loses it. `docs/react.md` already shows a component with a bus, so the loss is small.
