# Design

## Context

0.9.0 added `pending` and `cancel` to `createJob` (see `openspec/specs/job-outcomes`). The job wraps the handler: a bound handler is `job.wrap(policy(fn))`, so the job's `route` runs before the policy and cannot tell what the policy decides. `latest` and `debounce` do not abort the task of the job but a forked child (`forkTask`), so the job sees no abort when a run is replaced. The policies already know each moment that matters and report it to the tracer: `traceRun` where `fn` starts, `traceTask(ctx, effect, "drop")` where a call is dropped, `settle("cancel" | "drop")` in `latestWith`. The tracer cannot be reused: in the `notrace` build `TRACE` is false and those calls are removed, and a job must work in both builds. See proposal.md for the motivation.

## Goals / Non-Goals

**Goals:**
- `pending` when the handler really starts; one closing outcome for each started call; nothing for a call that never started.
- A boolean flag exact for `latest` (replacement) and `leading` (drops), a counter exact for all policies.
- No growth of `createBus`; a policy used without a job costs one property read per report.

**Non-Goals:**
- A custom policy that does not report (it is treated as no policy).
- A counter or status helper on the job.
- Tracing of the reports.

## Decisions

**A lifecycle object on the task context, under a symbol key.** `route` sets `ctx[lifecycle] = { claim, start, drop, cancel }` for the call before it calls the base handler and removes it after. The key and its type live in `src/core/lifecycle-key.ts`, next to `emit-key.ts`; `createBus` does not import it, so its size is not touched. Policies read it with `Reflect.get(ctx, lifecycle)` through helpers in `src/policies/lifecycle.ts`. A forked context copies the own properties of its parent (`forkTask` spreads the parent as user fields), so the child of `latest` carries the same object. Alternative: reuse the tracer (rejected: removed in `notrace`); a field on `Context` (rejected: grows core).

**A mark on the policy task tells the job a policy is in charge.** The job cannot tell from a call whether a policy wraps the handler, and a debounced call returns a pending promise like a slow handler does. `keyed()`, which every library policy returns through, sets a symbol (`reportsLifecycle`) on the task it returns. `job.wrap(base)` reads that mark once, when the handler is bound: marked means the job waits for the `start` report, unmarked means it sends `pending` at the call, as it does today. A policy hidden in a function of your own is unmarked, so it keeps the old behavior. (A first draft had each policy call a `claim` at each call; the static mark costs nothing per call.)

**`start`, `drop`, `cancel`, `done` map to the places the policies already trace.** `start` goes where `traceRun` is called in `leading`, `throttle`, `queue` and `debounce` (the `fn` call) and in `begin()` of `latestWith`; `drop` goes where `traceTask(..., "drop")` is called and where `latestWith` settles a call that never began; `cancel` goes where `latestWith` settles a call that had begun (its child aborted by the next call). Helpers `startCall(ctx, effect, fn)` and `dropCall(ctx, effect)` do the report and the trace together, so each policy changes by a few lines. `queue` also reports `done` when a handler settles, before it frees the slot and starts the next call: the slot is freed before the caller is resolved (a decision of the queue), so without `done` the job would send the closing outcome after the next `pending` and a boolean flag would blink.

**The job sends by the report, once.** `start` sends `pending` (only the first `start` of a call counts, because `debounce` over `latest` reports twice). `drop` before a start marks the call finished and sends nothing. `cancel` after a start sends `cancel(reason)` through the gate of `emit-key.ts` and marks the call finished. The abort of the job's own task does the same through `onAbort` if the call has started. A call that is marked finished sends no `success` or `fail` later, whatever the promise does. This keeps the invariant: no closing outcome without `pending`, exactly one with it.

**`cancel` at the moment of the abort.** 0.9.0 sent `cancel` when the handler settled. For a boolean flag that is wrong under `latest`: the replaced run closes after the new run has sent `pending`. Sending at the abort puts `cancel` before the next `pending`, because `latestWith` aborts the previous run before it forks the next. A handler that ignores the signal then no longer delays `cancel`, which is also what the flag wants. The result of the aborted handler is dropped, as it already is.

**Dropped calls are silent, not `cancel`.** An obvious reading is "dropped calls send `cancel`". It breaks the flag: under `leading`, call 2 is dropped while call 1 runs; a `cancel` of call 2 clears the flag of call 1. A call that never started holds no flag, so it sends nothing. This differs from the first wording of the request and is the point to confirm.

**Alternative: carry a call id in every outcome.** It would let a store tell calls apart, but changes every payload; the pairing rule above is enough for a counter, and a boolean is exact where calls do not overlap or `latest` replaces them.

## Risks / Trade-offs

- [Behavior change of 0.9.0 jobs under policies] → documented in the changelog and in the migration of the spec; 0.x.
- [A policy that forgets `claim`/`start` is silently treated as no policy or never sends `pending`] → one test for each of the five policies with a job, and a test of the plugin matrix is not needed (no plugin).
- [`start` reported by `debounce` over `latest` twice] → the job takes only the first.
- [Size of `policies (all)` and `actions (all)`] → measure with `pnpm size`, raise by the measured amount only.
- [`Reflect.get` on every report] → one read when there is no job; measure `scripts` benchmarks are not needed (no hot path beyond that).
