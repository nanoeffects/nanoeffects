# Proposal: job-lifecycle-outcomes

## Why

A loading flag for a request has no good place today. `createJob` emits only `success` and `fail`, so the app sets the flag by hand in the handler with `try/finally`, and has to remember that `ctx.emit` does nothing once the task is aborted. Each team writes this differently and some get it wrong: after `latest` or `ctx.abort()` the flag can stay `true`. `createAsyncThunk` gives `pending`, `fulfilled`, `rejected` for this; `createJob` is documented as its counterpart but lacks the first.

## What Changes

- `createJob` takes two more optional outcomes next to `success` and `fail`: `pending` (emitted when the handler starts, with the payload of the call) and `cancel` (emitted when a task that has started is aborted before it settles, with the abort reason).
- Both follow the rules of `success` and `fail`: a string makes an action creator, an existing creator is used as it is, and a missing one gets the default type `<type>/pending` and `<type>/cancel`. The job gets the properties `pending` and `cancel`.
- `pending` is sent for every call of the job, just before its handler is called. A job without a handler sends nothing (`emit` throws `MissingHandlerError`).
- A call whose task is aborted before it settles sends `cancel` instead of nothing. This needs a way to emit after the abort (see `design.md`).
- Policies are not part of this change. A policy wraps the handler, inside the job, so `pending` is sent before the policy decides: a call that `leading`, `throttle` or a full `queue` drops still sends `pending` and then `success(undefined)`, and a run that `latest` replaces aborts a child task, not the task of the job. A loading flag is therefore reliable for a job without a policy, and for `ctx.abort()` or a parent that is aborted (a page that is left). Making policies tell the job when a call really starts is a follow-up.
- Calls that give only `success` and `fail` keep working: the added outcomes are extra events, and a bus without a listener for them runs as before. They are events like `success` and `fail`, so `onUnhandled` (a dev diagnostic) is now also called for a `pending` or `cancel` that nobody listens to.
- No new naming scheme: the default `<type>/...` types already exist, so the idea of a string prefix is dropped.
- Docs: a recipe "Show a loading state" in `docs/actions.md` or its own page, an update of the `createJob` JSDoc, `CHANGELOG.md`.

Out of scope: policies that tell the job a call has started or was dropped, `job.status()` or any state held by the library (a follow-up that can be built from these outcomes), a graph of states, a new `createAsync` function.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `job-outcomes`: the job gets the `pending` and `cancel` outcomes with their defaults, timing and the rule for calls that do not start.

## Impact

- `src/actions/job.ts` (outcomes, timing), tests in `job.test.ts` and a test in `src/tests/` that pins what a job does under `latest`, `leading` and `queue` today.
- `src/core/context.ts`: a way for the job to emit after an abort. Measured: `createBus` stays within 1.3 kB (1293 bytes) after the size was won back elsewhere in core; `nanoeffects/actions` grows by about 90 bytes and its limit goes from 2.65 kB to 2.7 kB.
- Types: `Job<P, R, T, S, F>` gets parameters or a mapped shape for the two outcomes; `src/tests/types.test.ts` covers inference.
- `docs/actions.md`, `docs/migrating-from-effector.md` (the `effect.pending` row), `llms.txt` if a page is added, `CHANGELOG.md`.
