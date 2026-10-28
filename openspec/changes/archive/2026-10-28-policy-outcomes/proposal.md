# Proposal

## Why

`createJob` sends `pending` and a closing outcome so a store can keep a loading flag. With a policy around the handler (`latest`, `leading`, `throttle`, `queue`, `debounce`) the flag is wrong today: `pending` is sent for every call, before the policy decides, and a call that the policy drops or replaces closes with `success(undefined)`. A `leading` job that drops a second click clears the flag while the first run still goes; a `latest` job closes the replaced run after the new one has started. The 0.9.0 docs name this as a limit. The policies are the main use of the library, so the limit hits the common case.

## What Changes

- Policies report the life of a call to the job that wraps them: they take charge of the call, tell when `fn` really starts, when the call is dropped before it started, and when a started call is cancelled by the policy itself (`latest` replacing a run). They do it through a lifecycle object that the job puts on the task context under a symbol key. Without a job nothing is reported and policies behave as they do now.
- `createJob` follows that report. `pending` is sent when the handler really starts, not when the call is made. A call that is dropped before it started sends nothing. A started call closes with exactly one of `success`, `fail` or `cancel`. A started call that the policy replaces or aborts sends `cancel` at that moment, so it comes before the `pending` of the call that replaced it.
- **BREAKING (0.x behavior of the job):** a call dropped by a policy no longer sends `pending` and `success(undefined)`; it sends nothing. A replaced `latest` run sends `cancel` instead of `success(undefined)`. A job without a policy is unchanged. `cancel` is sent when the task aborts, not when the handler settles later.
- Policies and docs: replace the "Limit: policies" part of `docs/actions.md` with what holds now; a flag set by `pending` and cleared by `success`, `fail` and `cancel` is exact when calls do not overlap, and a counter is exact always.
- No change to `createBus`. The key is a symbol in `src/core` that `createBus` does not import.

Out of scope: `job.status()` or a counter helper; tracing of dropped calls through the job; reporting for custom policies (a policy that does not report is treated as no policy, so the job sends `pending` at the call, as before).

## Capabilities

### New Capabilities
- `policy-lifecycle`: what a policy tells the job about a call, and what it does without a job.

### Modified Capabilities
- `job-outcomes`: when `pending` is sent, what a dropped or replaced call sends, and when `cancel` is sent.

## Impact

- `src/core/lifecycle-key.ts` (new, a symbol and a type), `src/policies/lifecycle.ts` (new, small helpers), edits at the entry, start and drop points of `latest`/`latestWith`, `debounce`, `leading`, `throttle`, `queue`; `src/actions/job.ts` (route).
- Tests: new `src/policies/lifecycle.test.ts`; `src/tests/job-outcomes.test.ts` has the pinned limit tests, which change; `job.test.ts` for timing of `cancel`; tree shaking and sizes.
- `docs/actions.md` (loading-state section), `docs/policies.md` (one note), `CHANGELOG.md`, `package.json` size limits if they move.
