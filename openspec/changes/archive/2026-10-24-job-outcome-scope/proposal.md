# Proposal: the outcome action's own scope wins over the job's

## Why

A job sends `success` or `fail` as an action. `send()` in `src/actions/job.ts` passes the job's scope as the explicit layer of `emit`, which is the strongest one, so when the outcome action has a scope of its own the job's fields replace it. Code review of `scope-context` found it. The spec puts action, command and job on one level, so the case was left open. The outcome action is the more specific place for its own listeners, so its own fields should win.

## What Changes

- When a job sends an outcome whose creator has a scope, the listeners of that outcome see the job's fields with the action's own fields over them. Fields and `effects` are merged one level deep: a name set by both takes the action's value.
- A job outcome without a scope of its own behaves as before: the listeners see the job's scope.
- No new API. Without `scopePlugin` a scope is still ignored.

## Non-goals

- A general rule for the order of layers at one level; the rest of the order is unchanged (`emit`, action / command / job, module, bus).
- Merging scopes anywhere else.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `scope-context`: the requirement "A scope can be given to an action, a command, a job and a module" gets a scenario for the outcome action's own scope.

## Impact

- `src/actions/job.ts` (`send`); a test in `src/scope/places.test.ts`; one line in the job section of `docs/scope.md`; `CHANGELOG.md` under `Unreleased`.
- `nanoeffects/actions` grows by a few bytes; its size limit is checked.
