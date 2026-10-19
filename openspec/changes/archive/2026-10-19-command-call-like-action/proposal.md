# Proposal

## Why

`createAction` already follows Redux Toolkit: the call builds `{ type, payload }`, and `bus.emit(added(2))` delivers it. Commands and jobs still use a different shape, `bus.emit(double, 21)`, while `double(21)` runs the handler outside the bus. One call style for actions, commands and jobs makes the README and `nanoeffects/actions` easier to learn and matches how people already use RTK.

## What Changes

- **BREAKING**: Calling a command (and therefore a job), `command(payload)`, SHALL no longer run its handler. It SHALL return an action-shaped value `{ type, payload }` like `createAction`, suitable for `bus.emit(...)`.
- **BREAKING**: The documented and typed way to run a command on a bus SHALL be `bus.emit(command(payload))`, which notifies listeners of the type, runs the handler (own or from the registry), and returns the result.
- `bus.emit(command, payload)` MAY remain as an equivalent overload so existing call sites can move gradually; docs and examples switch to the call-then-emit form.
- `createAction` stays as it is; jobs inherit the command change because a job is the command.
- Docs, examples, guide tests and CHANGELOG record the break under the next version.

## Capabilities

### New Capabilities
- `command-action-call`: calling a command or job builds `{ type, payload }`; emitting that value runs the command on the bus and returns its result (and how that differs from a plain action with the same shape).

### Modified Capabilities
- `command-registry`: scenarios and requirements that assume `bus.emit(command, payload)` or that a direct `command(payload)` runs the handler.
- `job-outcomes`: scenarios that emit a job as `bus.emit(loadUser, …)` or imply a direct call runs work.

## Impact

- Code: `src/actions/command.ts`, `src/actions/job.ts`, `src/core/bus.ts` (`emit` / `Emittable` / `Command` types), possibly a small brand or helper so `emit` can tell a command call from a plain Redux action.
- Tests: command, job, bus, guide, types, registry and module tests.
- Docs: `README.md`, `docs/actions.md`, `docs/guide.md`, `examples/guide.ts`, `examples/modules.ts`, `CHANGELOG.md`, `AGENTS.md` if it states the old call rule.
- No new dependency. Package not released as stable yet; still a **BREAKING** API change for anyone on `0.x`.
