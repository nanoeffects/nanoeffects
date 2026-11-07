# Design

## Context

Effects take `ctx` first and run as a traced group: `withGroup` (`src/effects/group.ts`) forks a child task, reports `start`, then `done` / `error` / `cancel`, and **rejects at once when the parent aborts** (`raceAbort`). `runTraced` runs one call as a `run` child. `all`, `allSettled` and `race` also have a starter form that `groupOrStarter` (`src/effects/run.ts`) tells from the `ctx` form by the argument count; `all` takes options in the `ctx` form only. `effectsPlugin` binds any function with `{ signal }` first, with a hand-written type for the built-in ones. Options are read with `??` so that `null` falls back (`concurrencyOf` in `run.ts` is the model, including its `RangeError`). See proposal.md for why.

Two facts shape the design:
- A child of an aborted group is aborted at once, so a rollback cannot run as a child task of the group after an abort.
- `withGroup` rejects as soon as the parent aborts. A transaction must not: its result has to wait for the rollback (see D4).

## Goals / Non-Goals

**Goals:**
- One call that makes a rollback correct on failure and on abort, with the strategy a caller can set, and no code in the handler besides the steps.
- Fits what exists: `ctx` first, a starter form for groups, `effectsPlugin`, the trace.
- No change to `src/core` beyond one name in the type `EffectName`.

**Non-Goals:**
- Durable transactions. The list of finished steps lives in memory; a closed tab or a crash loses it. The docs say so.
- Parallel forward steps (`run` of the steps), nested sagas. A parallel *rollback* is an option; see D5.
- A retry option for a rollback (D6), a `forward` order, a `transaction` option on actions or modules, a policy.
- Making `rollback` safe to call twice. That is the job of the caller's API (idempotent rollback); the docs say it.

## Decisions

### D1. A step is `{ run, rollback }`; `rollback` gets the value of `run`
`run(child)` returns the value; `rollback(value)` receives it. The alternative, closure variables set in `run` and read in `rollback`, puts `let orderId` next to every step, and `rollback` can read it before it was set. With the value passed, a step that has no value has nothing to roll back, which is exactly the rule for a failed step (D2). `rollback` is optional: a step without one has nothing to roll back (a read, or a call that cannot be undone). The steps are an array, not an object: the order is the meaning. `run` gets the child context (as a starter of `all`), so `({ signal }) => api.charge(id, { signal })` reads the same as in `all`. `rollback` gets no context: see D5 for why.

### D2. Which steps are rolled back
Those whose `run` returned. The failed step is not rolled back: the library cannot know how far it got, and a half-done step is the job of its own `run` (it can catch and clean up itself). A step whose `run` ignored the abort and returned a value after it counts as finished and is rolled back: the side effect happened. A step whose `run` rejected because of the abort is a failed step.

### D3. Strategy: three options, the step wins over the effect
Options are named with the prefix `rollback`, so a bare `on` is not mistaken for a handler (`rollbackOn`) and the three read as one family.

| Option | Values (default first) | Step | Effect |
| --- | --- | --- | --- |
| `rollbackOn` | `"both"`, `"error"`, `"abort"` | yes | yes |
| `rollbackFailure` | `"continue"`, `"stop"` | yes | yes |
| `rollbackOrder` | `"reverse"`, `"parallel"` | no | yes |

Precedence is step, then `options`, then the default; `null` falls back like `undefined` (plain JavaScript callers). `rollbackOrder` is effect-only because it describes the whole rollback: a step cannot be "parallel" alone. A per-step `rollbackOn` is the useful case ("release the stock on any failure, but keep the audit record when the task is only aborted"), as is a per-step `rollbackFailure` ("if refunding fails, do not go on to cancel the order").

**`rollbackOn`.** The trigger of a rollback is `"abort"` when the signal of the task is aborted by the time the forward run ends, and `"error"` otherwise. A step is rolled back when its effective `rollbackOn` is `"both"` or equals the trigger. A step that is not rolled back is skipped, like one with no `rollback`. When nothing is to be rolled back, the result settles at once.

**`rollbackFailure`.** It is read from the step whose `rollback` just failed. `"continue"` goes on to the next; `"stop"` calls no further rollback. Errors are collected either way (D4). Alternatives for the whole error question:
- Always stop at the first failed rollback: the earlier steps stay applied with no sign they were skipped. Rejected as the default, kept as `"stop"` because a failed refund can make the next rollback wrong.
- A `TransactionError` class: an export for one case, and the surface does not grow without demand. Rejected; `AggregateError` can be replaced later without breaking `catch`, since the original error is `errors[0]`.
- A callback for rollback errors, with the original always thrown: an error is lost unless the caller wires it. Rejected.

**`rollbackOrder`.** `"reverse"` is the saga rule (the last thing done is undone first, because a later step may depend on an earlier one). `"parallel"` is for independent steps and starts all rollbacks at once; the result waits for all to settle. `"stop"` has nothing to stop in a parallel rollback, so `rollbackFailure: "stop"` anywhere together with `rollbackOrder: "parallel"` is a `TypeError`, found before any step starts. A forward order is not offered: no real flow needs it, and it can be added as a value later.

**Validation** happens once, before the first step: a value outside its list is a `RangeError` (as `concurrency` is), the `stop` + `parallel` pair a `TypeError`. A flow must not discover a typo after it has charged a card.

### D4. An error of a rollback does not hide the original; the result settles after the rollback
If no rollback failed, the result rejects with the original (the failed step's error or the abort reason), so `catch (error)` and `error.name === "AbortError"` keep working. If one or more failed, it rejects with `AggregateError([original, ...rollbackErrors], message)`, errors in the order they happened (in parallel mode, in the order they settled). `AggregateError` is built in (Node 15+, all current browsers; the package targets Node 18+).

`transaction` does not use `withGroup`, because `raceAbort` rejects at the abort and the rollback would run behind a rejected result. That is visible: `queue` frees its slot when the handler settles (the next call would start while the old rollback runs), and a test that awaits the handler would end before the rollback. So the body is its own function: it reports `start`, runs the steps, on failure or abort rolls back, and only then settles. `createSettle` / `traceTask` / `traceRun` / `forkTask` (the helpers `withGroup` uses) give the trace; they are guarded by `TRACE` already, so the `notrace` build needs no change.

`latest` is different on purpose: it aborts the old call and starts the new one at once, without waiting for the old to settle. With `latest`, the rollback of the old call and the first steps of the new one can overlap. A flow that must not overlap uses `queue`. The docs say this next to the recipe, and a test pins it.

### D5. How the rollback runs after an abort; no context for `rollback`
Each `rollback` is called as a plain function with the value: no child task, no signal. A child of the aborted group would be aborted (see Context), and the spec says `rollback` gets no abort signal. The cost: a `rollback` is not a `run` child in the trace. The group ends `done`, `error` or `cancel` for the **forward** outcome, at the moment it is known (an abort reports `cancel` at once, as every group does, while the result still waits for the rollback). A user who wants the rollback calls in the trace wraps them in their own effect. Alternative: fork rollback children from a detached context, which needs a context that has the bus but not the abort of the parent; there is no such helper, and it would cost `src/core` size for the trace only. Rejected for now; it can be added without changing the contract.

### D6. No retry option; the user wraps the callback
Retry of a failed rollback is the one strategy that the library already has an effect for. `rollback` is a plain callback of the value, so `rollback: (value) => retry({}, () => api.cancel(value), { times: 3 })` does it with no new option, and the user picks the times, the delay and `shouldRetry` with the options of `retry` they already know. `{}` as the context is what the docs prescribe for an effect outside a task (AGENTS.md): it means no signal, which is what a rollback wants. The transaction awaits the promise and counts a final rejection as a failed rollback (D3, D4). A `retry` option on the transaction would duplicate `RetryOptions` and decide for the user. The docs show the line once in the section and in the recipe, with the note that a retried rollback should be idempotent and the API calls inside it should have their own `timeout` (a rollback that hangs keeps the handler pending).

### D7. Call forms; where the options go
**Revised after D8:** the steps can also be arguments (`transaction(ctx, options?, ...steps)`, `transaction(options?, ...steps)`), so that `rollback` is typed from `run`. The array forms stay for a list built at run time. Runtime rule (`transaction.ts`): an array first is the starter with an array; else a context first with an array second is the `ctx` array form; else the call is positional: the first argument is a context when it has an object `signal` (a task context has a `run` method too, so `signal` is read first), and `{}` is **options**, not a context (so empty options built at run time are not taken for a context, and the types agree: the context overloads of the positional form need `{ signal: AbortSignal }`; `{}` as a context stays valid in the array form, where the second argument is an array); an object with a `run` function is a step (a starter with no options); `null` or any other object is the options of a starter. A leading value after the context that is not a step is the options; no step, or a non-step among them, is a `TypeError`. Options are validated before the first step, as in the array form. 

Original reasoning, for the array forms: `transaction(ctx, steps, options?)` and `transaction(steps, options?)` (a starter), both with options. `all` cannot do this: its effects are an object or an array, so `all(effects, options)` looks like `all(ctx, effects)` by the argument count, and the public surface says why `all` takes options in the `ctx` form only. The steps of a transaction are always an array, and a context never is, so the first argument tells the forms apart: `Array.isArray(first)` is the starter, anything else is a context. A context with no steps is a `TypeError`, as in `all`. The owner chose options in both forms, so `rollbackOrder` can be set for a transaction that a group starts. The cost is one `Array.isArray` check, and `transaction` does not reuse `groupOrStarter` (its test is the argument count); the starter and the `ctx` form share one inner function. The strategy stays a step option too, because a step is the place for "this one differs". A Task form (`transaction(steps)` as a handler) is not offered: its steps would need the payload, a design of its own, and `all` has none either; a handler writes `bus.on("checkout", (order, ctx) => transaction(ctx, ...))`. For `effectsPlugin`, `transaction` goes into `Supported` with a hand-written bound type with the three forms (options and steps, steps, array), because `BoundForm` would lose the tuple. This is types only.

### D8. Types
The result is a tuple of what each `run` returns, as `Awaited<ReturnType<S[K]["run"]>>` over the tuple `S` of the steps (the way `all` types its result), and that holds when `run` is written as `({ signal }) => ...`. With steps as arguments, the tuple is `R` and the result is `{ [K in keyof R]: Awaited<R[K]> }`. `TransactionStep` is `{ run, rollback?, rollbackOn?, rollbackFailure? }` and `TransactionOptions` has the three options; both are exported (types only; `src/tests/surface.test.ts` lists them), together with the three word types.

**Found in task 1.1:** TypeScript (tsgo 7) does not infer the parameter of `rollback` from `run` of the same step in an array literal. Reverse inference over a mapped tuple (`{ [K in keyof T]: Step<T[K]> }`) works only while one of the two functions has no unannotated parameter; with `({ signal }) => ...` for `run` and `(value) => ...` for `rollback` the result became `unknown[]`. A tuple of the steps with `rollback(value: Awaited<ReturnType<S[K]["run"]>>)` in an intersection did the same. So `rollback` takes `value: any`: the result stays exact, and a reader who wants the value checked annotates it (`(orderId: string) => ...`). A step builder function would infer it, but it is a second export for one type; rejected.

**Revised: steps as arguments infer it.** A rest parameter of a mapped tuple, `...steps: { [K in keyof R]: StepOf<R[K], Child> }` with `StepOf<R, Child> = { run: (child) => R; rollback?: (value: Awaited<R>) => unknown }`, infers each step on its own, so `rollback` gets the awaited result of its `run`, with `run` in the same form `({ signal }) => ...` (checked on `async`, sync, spread and the starter form). `R` must **not** be a `const` type parameter: it would make `async () => 1` return the literal `1`. Options after the steps do not infer (`[...Steps<R>, Options]` loses the parameter types), so options go **before** the steps. Overload order matters: the forms with options come first and use `LeadingOptions = TransactionOptions & { run?: never }`, so a step (it has `rollbackOn` too) never passes for options; without that, a failed first overload fixed the type of `rollback` as `never`. The array overloads stay first of all and keep `any`. A call with no step is rejected by `R extends [unknown, ...unknown[]]`. A wrong call now reports its error at the call, not at the option, because the last overload is the one reported; type tests place `@ts-expect-error` above the call. Two consequences, stated in the docs: a wrong annotation of `rollback` is not an error, and a key that a step does not have (`rollbackOrder` on a step) is not an excess-property error, because `S` is inferred from the literal.

### D9. Size
The body is a loop, the strategy lookup, a parallel branch, a few helpers and the error collection. The estimate is a few hundred bytes of brotli, more than the first estimate because of the options. The limit of `effects (all)` is 3 kB; the task measures `dist/effects.js` before and after and sets the new limit from the number, as the changes before did. If the entry grows by more than about 0.5 kB, the code is cut first (the parallel branch is the first candidate: it can leave to a later change without touching the rest of the contract). The core is untouched.

### D10. Name and the first lines of the docs
`transaction` was the owner's word, `rollback` the name of the step field. The docs say what it is in the first lines: a list of steps with a rollback, rolled back in memory. They also say it is not a database transaction and not durable, so a reader does not look for isolation or persistence.

## Risks / Trade-offs

- [`rollback` not traced (D5)] → the group's end phase and the `run` children of the forward steps are in the trace; documented. A later change can add rollback children without touching the contract.
- [`latest` overlaps an old rollback with a new run (D4)] → documented with the `queue` advice; a test pins it.
- [`rollback`'s parameter is `any`, and a step's unknown key is not an error (D8)] → the result type is exact; the docs show the annotated form; `rollbackOrder` on a step does nothing, and the docs say the order belongs to the options.
- [Three options and two levels make many combinations] → a fuzz test runs every strategy against a plain model; the defaults are the saga rule, and the docs show the defaults first and each option by a real case.
- [A `rollback` that hangs keeps the handler pending] → the docs tell to give the API calls inside `rollback` their own `timeout`; the transaction cannot, since a rollback has no signal.
- [Rollback is in memory; a crash loses it] → stated in the first lines of the docs section and in the recipe.
- [`AggregateError` changes what `catch` sees] → only in the case that already is a double failure; the original is `errors[0]`.
- [A step's `run` that returns after the abort holds the rollback until it returns] → the effect cannot stop code that ignores its signal; same as `all`. Documented with `pass-the-signal.md`.
- [Two ways to give steps, and `{}` as the options of a starter reads as a context (D7)] → the docs say which form infers types and that options need a key or `null`; the types of `transaction(ctx)` with no step are an error; tests pin every shape and a fuzz runs one transaction through all forms.

## Migration Plan

New API, no migration. `CHANGELOG.md` `Unreleased` → `### Added`: one bullet and a link to the docs section. The version bump is the owner's at release time.
