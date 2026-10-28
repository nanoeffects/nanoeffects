# Tasks

## 1. The lifecycle key and the helpers

- [x] 1.1 Add `src/core/lifecycle-key.ts` (the symbol and the `Lifecycle` type with `claim`, `start`, `drop`, `cancel`); check that `createBus` does not import it (bundle `createBus` and look for the symbol) and `pnpm tsgo` passes.
- [x] 1.2 Add `src/policies/lifecycle.ts` with `startCall(ctx, effect, fn)` and `dropCall(ctx, effect)`; each reads the key with one property read and does nothing without it, and `startCall` and `dropCall` keep the trace calls they replace; add `src/policies/lifecycle.test.ts` for the no-job case; verify `pnpm vitest run src/policies/lifecycle.test.ts`.

## 2. Report from the policies

- [x] 2.1 `leading`, `debounce` (leading-only and trailing), `throttle`, `queue`: replace the `traceRun` of the handler with `startCall` and the `traceTask(..., "drop")` with `dropCall`; verify the existing tests of each policy pass unchanged.
- [x] 2.2 `latestWith` (so `latest` and `debounce`): report `start` in `begin`, `drop` when a call that never began is settled, `cancel(reason)` when one that began is aborted by the next call; verify the existing tests of `latest` and `debounce` pass.

## 3. Follow the report in the job

- [x] 3.1 In `src/actions/job.ts` set the lifecycle object on the task for the call and remove it after; send `pending` on the first `start`, nothing on `drop` before a start, `cancel` on `cancel` or on the abort of the task after a start; mark the call finished so no later `success` or `fail` is sent; mark managed handlers by the symbol that `keyed()` sets and send `pending` at the call for the others; have `queue` report `done` before it starts the next call; verify `pnpm tsgo`.
- [x] 3.2 Update `src/actions/job.test.ts` and `src/actions/command-trace.test.ts` for `cancel` at the abort (not at the settle); verify they pass.
- [x] 3.3 Rewrite the pinned-limit tests of `src/tests/job-outcomes.test.ts` to the scenarios of `specs/policy-lifecycle/spec.md` and `specs/job-outcomes/spec.md`: `leading` drop is silent, `latest` replacement sends `cancel` before the next `pending`, `debounce` sends one `pending` at the run, `throttle` and `queue` start and drop, a custom policy that does not report, a counter and a boolean flag in each case; verify `pnpm vitest run src/tests/job-outcomes.test.ts`.
- [x] 3.4 Check a policy used on a plain bus and by `withPolicy` is unchanged (existing tests) and that the plugin matrix still passes.

## 4. Docs, size, release notes

- [x] 4.1 Replace the "Limit: policies" paragraph in `docs/actions.md` ("Show a loading state with a job") with what holds now: when `pending` is sent, what a dropped and a replaced call send, a boolean flag versus a counter; add a short note to `docs/policies.md` (`Use a policy without a bus` is unchanged); verify `pnpm docs:check`.
- [x] 4.2 Update `docs/migrating-from-effector.md` (the sentence that says the flag is not exact with a policy) and add an entry under `Unreleased` in `CHANGELOG.md`, marking the change of behavior; verify `pnpm llms:check`.
- [x] 4.3 Run `pnpm size`; raise the limits of `policies (all)` and `actions (all)` only by the measured amount; check the `createBus` limit is untouched.
- [x] 4.4 Run `pnpm verify`; verify all pass.

## Workflow follow-up

- Archive the change after review (`/opsx:archive`).
