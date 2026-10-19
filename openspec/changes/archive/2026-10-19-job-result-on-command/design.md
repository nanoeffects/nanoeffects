# Design

## Context

`createJob` builds a command with `createCommand`, adds `wrap` to route the outcome, and returns it next to two action creators. `createAction` creators already have `match`. A command is a function with `type` (and `wrap` for a job); the `Command` type that the bus reads lives in `src/core/bus.ts` and has no `match`.

## Goals / Non-Goals

**Goals:**
- One value for a job: the command with `success` and `fail` on it.
- `match` on a command, as on an action creator.

**Non-Goals:**
- Changing routing, tracing, abort or the options of `createJob`.
- Adding `match` to the `Command` type of core: the bus does not need it, and `createBus` must not grow.

## Decisions

**1. The properties are `success` and `fail`.** They mirror the options of the same names and read well at the call site: `loadUser.success`. `Object.assign(run, { type, wrap, success, fail })`; a function has no own `success` or `fail`. Alternative: keep `successAction` and `failAction` on the command. Rejected: longer, and the owner asked for `success` and `fail`.

**2. `match` is added by `createCommand`, so jobs get it.** `Object.assign(run, { type, match })` where `match = (action) => action.type === type`, typed as a type guard to `{ type: T; payload: P }`. The return type of `createCommand` is `Command<P, R> & { readonly type: T; match(...) }`. `createJob` builds on `createCommand`, so its command keeps `match`. Alternative: put `match` into core's `Command` type. Rejected: it grows the core type for nothing the bus reads.

**3. The type of a job.** `Job<P, R, T, S, F>` becomes the command type plus `{ readonly success: ...; readonly fail: ... }` (an intersection), with the types of `success` and `fail` as now. The old `Job` object type is replaced; `index.ts` re-exports the new name.

**4. Destructuring still works.** `const { success, fail } = loadUser` or `const { success: userLoaded } = createJob(...)` needs no extra code, and `loadUser.success` is a creator that works with `bus.on` and `bus.emit`.

## Risks / Trade-offs

- [BREAKING for `{ command, successAction, failAction }`] → 0.2.1 was released days ago with it; a note in `CHANGELOG.md`, the version is chosen at release.
- [A command with `success` and `fail` properties could be mistaken for an object with those fields] → the types show a command; docs show `loadUser.success`.

## Migration Plan

`const { command: loadUser, successAction: userLoaded, failAction: userFailed } = createJob(...)` becomes `const loadUser = createJob(...)` with `loadUser.success` and `loadUser.fail` (or a destructuring of them).
