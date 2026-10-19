# Design

## Context

See proposal.md for motivation. Today `emit` runs a command only when the first argument is a function (`typeof event === "function"`). `createCommand` makes that function also callable as `command(payload)`, which runs the handler outside the bus. `createAction` already returns `{ type, payload }` from its call. Specs: `command-action-call`, deltas on `command-registry` and `job-outcomes`.

`src/core` must not import `src/actions`, so anything `emit` needs to recognize a command call lives in core.

## Goals / Non-Goals

**Goals:**

- One user-facing pattern: `bus.emit(creator(payload))` for actions, commands and jobs.
- Plain `{ type, payload }` (Redux actions, hand-built objects) stay notify-only.
- Keep `bus.emit(command, payload)` working as an equivalent overload during and after the change.

**Non-Goals:**

- Changing `createAction` or module/`handle` registration.
- Making every emit of a type that happens to match a command run a handler.
- A public “run without bus” API to replace the old direct call (call sites move to a bus, even a throwaway one).

## Decisions

1. **Command call returns a branded action.** `command(payload)` returns `{ type, payload, [commandCall]: command }` where `commandCall` is a `unique symbol` exported from core (next to the `Command` type). Same enumerable shape as an action for `type`/`payload`; the symbol is non-enumerable if practical so JSON/devtools stay clean. Alternative considered: look up handlers only by `type` on the registry — rejected, because a command that carries its own handler and a plain action of the same type would collide, and contracts without a registry could not run.

2. **`emit` runs when it sees a command function or a branded call.**  
   - `bus.emit(command, payload)` — unchanged path.  
   - `bus.emit(command(payload))` — read payload from the object, run `[commandCall]`.  
   - `bus.emit({ type, payload })` — listeners only.  
   `onUnhandled` stays skipped for both command forms (they always take the command path, which throws if there is no handler).

3. **Return type of `emit`.** Add an overload for the branded call so `bus.emit(double(21))` is typed as the command’s result `R`, not `void`.

4. **Jobs.** No special case: `createJob` returns a command from `createCommand`, so branding and emit follow automatically. Update job tests and any `command(payload)` inside job helpers to go through `emit` or to build the action without expecting a result from the call.

5. **Bundle size.** Brand check is a property read on the emit path; symbol lives in core. Measure `createBus` only if the emit path grows beyond a few lines.

## Risks / Trade-offs

- [Call sites that used `command(payload)` for the result break] → CHANGELOG + codemod-friendly note: wrap with `bus.emit(...)`.
- [Faking the brand on a plain object could trigger a command run] → Acceptable; same trust model as passing a forged command function today. Symbol reduces accidental collisions.
- [Two emit forms to maintain] → Shared internal “resolve command + payload” helper keeps one run path.

## Migration Plan

1. Implement brand + emit + types; flip all tests and docs to `bus.emit(command(payload))`.
2. Leave `bus.emit(command, payload)` green so private code can migrate file by file.
3. Changelog under the next `0.x` as **BREAKING**.
4. Rollback: revert the change tag; no data migration.
