# Proposal

## Why

`createJob` returns only a command, and the events that carry its outcome are created apart from it (`createAction("user/loaded")`) and passed in. The caller then holds three things that belong together, the command and its two actions, in three variables. Returning them together, and making the actions when only their types are given, removes the wiring.

## What Changes

- **BREAKING (`0.1.x`)**: `createJob(type, handler, outcomes?)` returns `{ command, successAction, failAction }` instead of the command alone.
- The options are `success` and `fail` (renamed from `done` and `fail`, to match `successAction` and `failAction`). Each is a string, from which the job makes an action creator with `createAction`, or an action creator that already exists, which is used and returned as it is.
- When an option is not given the job makes its action creator with a default type: `${type}/success` and `${type}/fail`. The outcome is therefore always routed, and an error of the handler always counts as handled: it goes to `failAction` and the promise of the command resolves with `undefined`.
- A command or a plain action object is no longer accepted as an outcome target: a target is a string or an action creator.
- `docs/actions.md`, `examples/modules.ts`, the tests and `CHANGELOG.md` move to the new shape.

## Capabilities

### New Capabilities
- `job-outcomes`: what `createJob` returns, how its success and fail actions are made or taken, and how the outcome of the handler is routed.

### Modified Capabilities

## Impact

- Code: `src/actions/job.ts` (the return shape, the options, the made actions and their types), `src/actions/index.ts` if types are exported.
- Tests: `src/actions/job.test.ts` and the tests that use a job (`command-trace.test.ts` if it does), `src/tests/types.test.ts`.
- Docs: `docs/actions.md`, `docs/guide.md` if a job is mentioned, `examples/modules.ts`, `CHANGELOG.md`, `AGENTS.md` if it names `createJob`.
- Not changed: how a job is run, traced and aborted; `createCommand`, `createAction`.
