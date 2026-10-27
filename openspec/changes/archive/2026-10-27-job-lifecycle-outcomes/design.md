# Design: job-lifecycle-outcomes

## Decisions

**Two more outcomes, not a new function.** `createJob` is documented as the counterpart of `createAsyncThunk` but has two of its three actions. Adding `pending` and `cancel` keeps one concept. A `createAsync` would be the same thing with another name. The outcomes stay optional with defaults, as `success` and `fail` are, so old calls do not change.

**No prefix option.** The default type is already `<type>/success` and `<type>/fail` (`createJob` in `src/actions/job.ts`). The new ones are `<type>/pending` and `<type>/cancel`; a string or a creator overrides each, as now.

**`pending` is sent inside `route`, just before the handler is called.** `route` runs for every call of the job that has a handler: from `invoke` with a context, or from `job.wrap` for a handler bound with `commands.handle`. The payload of `pending` is the payload of the call. A job without a handler sends nothing and `emit` throws `MissingHandlerError`. A listener of `pending` that throws counts as a failure of the call and goes to `fail`, so a call that sent `pending` always gets a closing outcome.

**Policies are out of scope (found while applying).** The first draft said that `pending` is sent only when a policy lets the call through. That does not hold: a policy wraps the handler and the job wraps the policy, so `route` runs first. Measured on a bound `leading(fn)`: two calls give `pending, pending, success, success`; on `latest(fn)`: `pending, pending, success, success`, where the first `success` is the replaced run closing with `success(undefined)` while the second call still runs. `latest` also aborts a child task, not the task of the job, so the replaced run is not a `cancel`. To make policies exact, they would have to tell the job when a call starts or is dropped (a change in `src/policies/*`). That is a separate change. Here the docs say that a loading flag is reliable without a policy and for an abort of the task or of its parent; `src/tests` pins the behavior under policies as it is.

**Exactly one closing outcome.** After `pending`, one of `success`, `fail`, `cancel` follows. `cancel` is chosen when the `ctx.signal.aborted` of the task of the job is true at the moment the call settles (resolved, rejected with the abort reason, or rejected for another reason after the abort). The abort wins over `fail`: an error caused by `fetch` rejecting with `AbortError` must not read as a failure.

**The weak point: `ctx.emit` does nothing after an abort.** `createTask` makes `taskEmit` that returns when `signal.aborted` (`src/core/context.ts`). That rule is the reason a stale response never reaches the app, and it must stay. `cancel` must be sent after the abort, so it needs an emit that is not gated. Options:

1. A symbol-keyed function on the context, set in `createTask` next to `emit`, that calls `bus.emit` with the same `emitter` bookkeeping and no abort check. The job reads it with `Reflect.get(ctx, key)`. Adds a few bytes to `src/core`. Not part of the public `Context` type.
2. Pass the bus emit to the job through the command call (`bus.commands.run`). No change to the context, but the job then needs the bus in its signature and in `job.wrap`, which policies call without it.
3. Ship `pending` only and leave `cancel` for later. The flag is correct when a newer call follows (`latest`) but sticks after `ctx.abort()` or an unmount.

Decision: option 1, in a cheaper shape. The first version (a second closure on the context) took `createBus` from 1297 to 1334 bytes and the owner agreed to raise its limit to 1.35 kB. It was then optimized instead: the context checks a symbol key (`emitAfterAbort`) before it drops an emit after an abort, and `createJob` sets the key for the time of its own emit of `cancel` only (it is reset at once, so a handler cannot emit stale results through it). With a plain `Symbol()`, no `Reflect.get`, and the identity helper `asContext` and the description of the `commandCall` symbol removed, `createBus` is 1293 bytes and its limit stays 1.3 kB. `nanoeffects/actions` grows by about 90 bytes (limit 2.65 to 2.7 kB). The plugin variant (`addContext`) would have needed an exported helper for the trace parent, which measured +13 bytes and also broke the old limit; without it `cancel` would lose its parent in the trace.

**The trace keeps its meaning.** `cancel` as an outcome is an action on the bus; the trace phase `cancel` of the task is separate and unchanged. A traced `cancel` action is a new event with the aborted task as its parent, and the sample rule is per root task as before.

**Order of listeners.** `pending` is emitted synchronously before the handler starts, so a store sets its flag before the first await of the handler. `success`, `fail` and `cancel` are emitted as now, as the task that ran the job, with the scope of the job (`send` in `job.ts`).

## Types

`Job` gets two more parameters, `PE` and `CE`, with the defaults `${T}/pending` and `${T}/cancel`, following `S` and `F`. The payload of `pending` is `P`; `cancel` carries `unknown`. `createJob` keeps its overloads; the outcomes object gains `pending?` and `cancel?`. `src/tests/types.test.ts` checks inference of all four and that a command as a target is still a type error.

## Risks

- A listener of `cancel` that throws during an abort. `send` for `cancel` goes through the same `emit` rules (the first handler error is thrown unless `onError` is set); the job catches it so the promise of the command still resolves with `undefined`.
- A handler that ignores the signal and resolves after the abort: `cancel` is sent once on settle, not twice. If the handler never settles, nothing is sent (documented; same as `success` today).
- A user who combines a job with a policy and a loading flag gets a flag that can stick (a dropped call) or clear early (`latest`). Mitigation: the docs say so next to the recipe; the follow-up fixes it.
- Growth of `Job` generics makes hover types longer. Accepted, as `S` and `F` already do this.

## Open questions

- Should `cancel` also be sent at the moment of the abort and not at the settle of the handler? Sending at the settle is simpler and keeps one place; sending at the abort is earlier for a handler that ignores the signal. Default: at the settle.
- Does the `effect.pending` row of `docs/migrating-from-effector.md` now point to the job outcomes? Yes; the row and the "No `pending`" note are updated in the docs task.

## Follow-up (not in this change)

Policies that tell the job when a call starts or is dropped, so `pending` and `cancel` are exact under `latest`, `leading`, `throttle` and `queue`. Then `job.status()` and a subscription, built from these four outcomes, held per bus.
