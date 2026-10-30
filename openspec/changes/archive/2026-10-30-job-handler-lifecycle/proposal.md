# Proposal

## Why

A policy tells the job around it when a call really starts, is dropped, or is cancelled, so `pending` and the closing outcome match what ran. That works only for a handler that is bound afterwards (`commands.handle(job, queue(fn))`, `m.handle`). The same policy given to the job itself, `createJob(type, queue(fn))`, is treated as having no policy: `pending` is sent at the call, so ten queued calls send ten `pending` at once while three run. The two ways to give a handler to a job look the same and count differently, and the page `docs/server.md` has to warn against one of them.

## What Changes

- A job reads the policy mark of the handler it was created with, as it does for a handler bound later. For `createJob(type, latest|leading|debounce|throttle|queue(fn))`, `pending` is sent when the policy starts the call, nothing is sent for a call dropped before it started, and `cancel` is sent when the policy cancels a started call.
- A handler that is not a library policy (none, a custom policy, a policy hidden in a function) keeps today's behavior: `pending` at the call.
- **Observable change:** code that created a job with a policy-wrapped handler sees `pending` later (at the start of the call), and no outcome for a call that never started. A counter of `pending` minus closing outcomes becomes exact for it.
- `docs/server.md` loses its warning about binding the handler in the registry. `CHANGELOG.md` gets a line under `Unreleased`.

## Capabilities

### New Capabilities

### Modified Capabilities
- `policy-lifecycle`: the requirement that a job tells a library policy from other handlers covers the handler given to `createJob`, not only a bound one.

## Impact

- `src/actions/job.ts` (one value read once in `createJob`), a test next to it, `src/tests/` or `src/policies/` for the policies through `createJob`.
- `docs/server.md`, `docs/actions.md` (check), `CHANGELOG.md`.
- `src/core` and `createBus` do not change. The size limit of `actions` is measured.
