# Proposal

## Why

`createJob` returns `{ command, successAction, failAction }`, an object to take apart. The job is a command, and its two actions belong to it, so they can sit on the command: one value to import, pass around and call, `loadUser.success`, `loadUser.fail`. A command is also the thing a listener or a test most often has to recognise, and an action creator has `match` while a command does not.

## What Changes

- **BREAKING (`0.2.x`)**: `createJob(type, handler, outcomes?)` returns the command itself, with two properties added: `success` and `fail`, the action creators of its outcome. `{ command, successAction, failAction }` is gone.
- The options stay `success` and `fail`: a string makes the action creator with `createAction`, an action creator that exists is used and returned as it is, a missing one gets the type `${type}/success` or `${type}/fail`. Routing is unchanged.
- `createCommand` returns a command with `match(action)`, as an action creator has: it tells whether an action has the command's type and narrows its type. A job gets it as a command.
- `docs/actions.md`, `examples/modules.ts`, the tests and `CHANGELOG.md` move to the new shape.

## Capabilities

### New Capabilities
- `command-match`: `match` on a command.

### Modified Capabilities
- `job-outcomes`: the return shape is the command with `success` and `fail`; the requirements that name `successAction` and `failAction` follow.

## Impact

- Code: `src/actions/job.ts` (the return shape and its type `Job`), `src/actions/command.ts` (`match`).
- Tests: `src/actions/job.test.ts`, `src/actions/command.test.ts`, the tests that use a job, `src/tests/types.test.ts`.
- Docs: `docs/actions.md`, `docs/guide.md` if a job is mentioned, `examples/modules.ts`, `CHANGELOG.md`, `AGENTS.md` if it names `createJob`.
- Not changed: how a job is run, traced and aborted; `createAction`; the `Command` type of `nanoeffects` core (so `createBus` does not grow).
