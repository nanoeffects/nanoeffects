# Design

## Context

`transaction` (`src/effects/transaction.ts`) has two ways to give steps, an array and positional arguments, each with a context and as a starter. All four end in `runTransaction(ctx, steps, settings)`: fork a group task, run the steps one by one, keep `finished: Finished[]` (`{ step, value }`), and on an error or an abort call `rollBack(finished, aborted, settings)`. `settingsOf(steps, options)` checks every option of every step and the transaction before anything runs. The forms are told apart by the first argument (`transaction()` at the end of the file), and a value with an object `signal` is a context before it is a step, because a task context has a `run` method too.

What was tried and rejected before this design (see `proposal.md` for the why): a `previous` argument of `run` (TypeScript cannot infer it from the earlier steps, it would be `any`, and `any[]` even blocks annotating it as a tuple); a single-step `transaction(ctx, run, rollback, options)` (it ends when its `run` ends and cannot learn that a later step of the handler failed); a change of `rollback` (a failed step is not rolled back: a step is atomic or cleans up after itself).

## Goals / Non-Goals

**Goals:**
- A function form where data between steps is a variable and `rollback` is typed from its `run`, with no `any`.
- One implementation of the rollback strategy for all forms: the same `Finished` list, `rollBack` and `settingsOf` rules.
- The existing forms and signatures stay exactly as they are.

**Non-Goals:**
- Replacing or deprecating the array and positional forms (the owner chose to add; steps as data remain useful for a list built at run time).
- A signal or a context for `rollback`, a `rollbackFailed` option, a `previous` argument, a timeout for rollbacks.
- Anything in `src/core` or `createBus`.

## Decisions

### D1. The shared part is a function around the work, not the list of steps
`runTransaction` is split in two: `inTransaction(ctx, settings, work)` does what is common (check `ctx.signal`, fork the group, `createSettle`, trace `start`, `onAbort`, the `try / catch / finally`, `rollBack`, the `AggregateError`) and calls `work(group, finished)`; the array forms pass a `work` that loops over the steps as today, the scope form passes a `work` that calls `body(step)`. `Finished` and `rollBack` are untouched, so the strategy has one implementation and the fuzz test can compare the forms. The cost is a closure per call, and the loop of the array form moves into a function; measure the size.

The scope `work`:
1. Make `step`, bound to `group` and `settings`.
2. `const result = await body(step)`.
3. `group.signal.throwIfAborted()` (a body that ignored the abort and returned is rolled back, as a step that ignored it is today).
4. `settle("done")` and return `result`.

### D2. What `step` does
```
step(run, rollback?, stepOptions?)
```
1. `open` is false after `inTransaction` ended (a `finally` sets it): throw a `TypeError`, run nothing.
2. `group.signal.throwIfAborted()`: throw the abort reason, run nothing.
3. `check(stepOptions)` and the `"stop"` with `"parallel"` combination (the same rules as `settingsOf`, applied to the one step: `RangeError` or `TypeError`).
4. `const value = await runTraced(group, (child) => run(child))`.
5. `finished.push({ step: { run, rollback, ...stepOptions }, value })` and return `value`.

Step 5 happens when `run` finishes, so concurrent steps (`Promise.all`) are listed in the order they finished and `rollBack` (which reverses the list) calls the last finished first. That is the order the spec states; the alternative, the order of the calls, would have been a second ordering rule for no gain. A step that finishes after an abort is pushed too, so it is rolled back (the same rule as the array form); the body then fails on its next `step` or on the final `throwIfAborted`.

### D3. Options are checked in two places
The options of the transaction are checked by `settingsOf([], options)` before `body` is called, so a typo there throws before anything runs, as in the other forms. The options of a step are checked when `step` is called, before its `run`. The other forms check every step before the first one runs; the scope form cannot, because the steps do not exist until the body calls them. A typo in a late step therefore shows after the earlier steps ran and are then rolled back (the error is an error of the body). TypeScript catches the typo at compile time (the options are unions of words), so this concerns JavaScript callers. The spec and the docs say it.

Two more differences found while implementing, both from the same cause (the steps are not known before the body runs):
- `rollbackFailure: "stop"` with `rollbackOrder: "parallel"` in the options of the transaction throws a `TypeError` before the body, even if every step would override `rollbackFailure`. The array forms see the steps and accept that case. The scope form cannot tell, and failing early is safer than failing at the first rollback.
- Options of the transaction that are not an object (and not `null`) throw a `TypeError`, because the second argument could be mistaken for a step or a second body (`transaction(ctx, body, fn)`).

The fuzz test therefore uses the scope form only for the random cases where both forms must agree (no `"stop"` at the transaction level with parallel order unless it throws in both). A flag to check the options early was considered and rejected: there is nothing to check before the call.

### D4. Dispatch
The new cases are told by a **function** where the other forms have an object:
- first argument is a function: the starter form, `transaction(body, options?)`;
- first argument is an object (`isContext`) and the second is a function: the `ctx` form, `transaction(ctx, body, options?)`. Any object counts as the context here, `{}` too: no existing form has an object followed by a function (options and steps are objects, a step is an object with a `run`), so `{}` is not ambiguous in this form, which makes `transaction({}, body)` valid outside a task, as `transaction({}, steps)` is.

The checks go before the existing ones, in `transaction()`, so none of the old rules sees a function and no old call changes meaning. A function in another place (a step list with a function in it, `transaction(ctx, fn, fn)`) keeps throwing the existing `TypeError`.

### D5. Types
```ts
export type StepOptions = Pick<TransactionStep, "rollbackOn" | "rollbackFailure">;

export type StepFunction<Child> = <T>(
  run: (child: Child) => T,
  rollback?: ((value: Awaited<T>) => unknown) | null,
  options?: StepOptions | null,
) => Promise<Awaited<T>>;
```
Overloads, placed before the existing ones so the body is not tried against the array overload first:
```ts
transaction<C extends { signal?: AbortSignal | undefined }, R>(
  ctx: C, body: (step: StepFunction<ChildOf<C>>) => R | PromiseLike<R>, options?: TransactionOptions | null,
): Promise<R>;
transaction<Child, R>(
  body: (step: StepFunction<Child>) => R | PromiseLike<R>, options?: TransactionOptions | null,
): (child: Child) => Promise<R>;
```
`T` is inferred from `run` alone, and `rollback` is typed from `Awaited<T>`: this is why `step` is a call of its own and not an element of a list. A prototype (`tsc --strict`) confirmed: `order` and `charge` keep their types through the body, a `rollback` with a wrong parameter type and `rollbackOn: "eror"` are errors, and a step with no options is `step(run)`. `Awaited<T>` matches the other forms, which type the `rollback` value as `Awaited<R>`. If a body written as `async (step) => ...` is inferred as `any` by an overload tried earlier, the fix is the order of the overloads, found in the first task (types first), not a change of the runtime rule. The bound form in `effectsPlugin` (`Bound.transaction`) gets one more overload, `(body, options?)`, with `Child` as the step's child type. `StepOptions` and `StepFunction` are exported from `transaction.ts` (and from `index.ts` of the entry if the others of its kind are).

### D6. The result is what the body returns
The scope form resolves with the value of the body, not an array. The array forms keep returning the values of the steps; a body that wants them returns them (`return [order, charge]`). Nothing else changes in the settle rules: the result settles after the last rollback.

### D7. Docs: the scope form first
`docs/effects.md` presents the scope form first, because it needs the least explanation: data is a variable, types are inferred. The array and positional forms follow as "steps as data" (a list built at run time, a list shared between callers, a `rollbackOrder` test). The recipe "pass the result of a step to the next one" is the scope form. The page also states, once, the rules a reader looks for: a failed step is not rolled back (a step is atomic or cleans up after itself, with the key-in-`catch` example); `rollback` gets no signal; a step the body catches does not start a rollback; the options of a step are checked at the call. The Russian pages mirror it.

## Risks / Trade-offs

- **Two ways to write one thing** → The docs lead with the scope form and name the one reason to use the others (steps as data); the surface grows by two overloads and one type, not by a plugin or an entry. The owner decided this (nothing breaks now, a later change can drop a form).
- **A step option typo is found late (JS only)** → TypeScript reports it at compile time; the rollback of the earlier steps runs; spec and docs say it (D3).
- **A body that never ends keeps the transaction open** → The same as a step that ignores its signal: `transaction` waits for the work. The docs say to pass `signal` to the calls inside `run`; the body cannot be cancelled by the abort except through its steps.
- **A saved `step` called late** → A `TypeError` (D2), so a leak is loud, not a silent step without a rollback.
- **Concurrent steps** → Rolled back in the order they finished (D2), tested; a case where that order matters to a caller is uncommon, and the docs state the rule next to the example.
- **Size** → A closure per call and a small helper. Measure `effects (all)` against the limit of 3.75 kB and set the new one from the number (a few bytes over). If the growth is large, share more with the array forms before raising it.
- **The shared function changes working code** → The array forms go through the new `inTransaction`; the existing unit, fuzz and type tests stay green unchanged, and the fuzz test gains the comparison of the scope form with the array form.

## Migration Plan

None: the change is additive, no existing call changes meaning. Ship under `Unreleased` / `Added`.
