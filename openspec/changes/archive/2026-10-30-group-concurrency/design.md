## Context

`runGroup` makes the group task (`withGroup`) and `startStarters` forks a child task for every starter and calls it at once (`src/effects/run.ts`). `all` and `allSettled` then gather the promises. Cancellation after the group ends is `cancelAll` (on failure for `all`, never for `allSettled`, on abort for both through `withGroup`). The form of the call is told by the number of arguments (`groupOrStarter`, change `group-starters`): one is a starter, two is the `ctx` form. See proposal.md for the motivation.

## Goals / Non-Goals

**Goals:**
- Bound the number of running starters of `all` and `allSettled` with one option.
- Keep the default path, the results, the types of the existing calls and the trace as they are.

**Non-Goals:**
- `race`, the short form with options, rate limits, priorities, a pool object.

## Decisions

### 1. Options are a third argument of the `ctx` form only

`all(ctx, effects, options)`. `groupOrStarter` reads three arguments as the `ctx` form; one is still a starter and two still the `ctx` form.

*Rejected:* (a) `all(effects, options)` for the short form. It has two arguments like `all(ctx, effects)`, and the two cannot be told apart by looking at the values: `{}` is a valid context, `{ concurrency: 5 }` and `{ a: starter }` are both plain objects. A guess on the keys would break `all({}, { concurrency: starter })`. (b) Options as a property of the effects object (`{ concurrency: 5, a, b }`), which clashes with a starter named `concurrency`. (c) A separate function (`allLimit`), which adds a name for one option. A nested group that needs a limit uses the wrapper `(child) => all(child, effects, { concurrency: 5 })` until a short form with options is shown to be needed.

### 2. A scheduler beside `startStarters`, used only with a finite limit

When there is no limit (`undefined`, `null`, `Infinity`), `runGroup` calls `startStarters` as today, so the default path is unchanged. With a finite limit a second function, `startLimited`, makes the same `{ tasks, cancelAll }`: `tasks` are promises that exist from the start, one per starter, and each is resolved when its starter has run. A starter is forked and called only when a slot is free, in the order of `effects`. When one settles, the next starts. This keeps `all`, `allSettled` and `gather` untouched: they await `tasks` as before.

### 3. Failure, abort and what "not started" means

`cancelAll` also sets a flag that the scheduler checks before it starts the next starter, so nothing waiting is called after a failure of `all` or an abort. `cancelAfter: "failure"` already calls `cancelAll` after a failed `all`; abort reaches it through `withGroup`'s `afterSettle`. The promises of starters that never start stay pending, as no one awaits them after the group has settled; they hold no timer and no listener because no child was forked. `allSettled` never sets the flag on a failure: its scheduler starts the next starter when a running one settles, either way.

### 4. Both array and object work, the order is the order of `Object.entries`

The scheduler walks the same entries `startStarters` does, so an array and an object behave as without the option. The result is filled by key as today.

### 5. Validation

`concurrency` is read with `??` (project rule for options that may be `null`). `Infinity` or no value means no limit. A value that is not `Number.isInteger` and not `Infinity`, or is below 1, throws `RangeError("concurrency must be a positive integer")` in `groupOrStarter`'s `ctx` branch before `runGroup`, so nothing is traced. The short form is not affected.

### 6. Trace

The group `start` comes from `withGroup` at the call, as now. A child task and its `run` are made when the starter starts, so a later starter's `run` comes after an earlier one's `done`. Parents, `rootId` and `traceGroupId` come from the same `forkTask` and `traceRun` calls. A recorder test compares a large limit with no option (same shape, as in `starter-group.test.ts`) and checks, with `{ concurrency: 1 }`, one group `start` and the ordering of the `run` events.

### 7. Types

New overloads of `all` and `allSettled` with a third parameter `options?: GroupOptions` (`{ concurrency?: number | undefined }`, exported as a type from `nanoeffects/effects`) after the existing `ctx` overloads; the result types are the same. The short-form overloads take no options.

### 8. Why not `race`

`race` ends when the first starter settles and cancels the rest. With a limit smaller than the number of starters, the later starters would wait for an earlier one to settle, and the race would be over by then, so they would never run. A bounded `race` has no useful meaning, so the option is not offered.

### 9. Size and speed

The scheduler is new code in `effects (all)`: I expect about 150 B. The limit (now 2.8 kB, size 2.73 kB) moves, to the next 0.1 kB, only if `pnpm size` says so, with both numbers in the commit message. The default path adds one comparison of the third argument per call; a scratch benchmark of `all(ctx, { a })` before and after confirms it (baseline 2.46 µs per call).

## Risks / Trade-offs

- [A starter that never starts leaves a pending promise] → no one awaits it after the group settles, and no resource is held; a test checks no timer or listener remains.
- [A wrapper is needed for a nested limited group] → shown in the docs; a short form with options can follow if it is needed.
- [An option on `all` but not on `race`] → the docs say why.

## Migration Plan

None: an optional argument. Rollback is removing the third argument and the scheduler.

## Open Questions

None that change the specs.
