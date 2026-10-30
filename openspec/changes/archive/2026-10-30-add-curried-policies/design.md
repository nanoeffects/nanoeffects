## Context

`usePolicy` hands `make` a task that forwards to the callback of the latest render. The hook's contract (the policy is made once, kept across renders) depends on the policy being built around that task. Today the only way to build it is the arrow `(task) => debounce(1000, task)`, and nothing stops `debounce(1000, callback)` there. The same type for both is the cause.

## Goals / Non-Goals

**Goals**
- `usePolicy(callback, debounce(1000))`: the reader never touches the task.
- No change to what a policy does; the direct form stays.
- Nothing in `src/core`; `createBus` size is untouched.

**Non-Goals**
- `useDebounce` and friends, a `pipe`/`compose` helper, a change to `withPolicy`, curried effects.

## Decisions

**1. Overloads by the type of the task argument.** `latest(fn, options?)` and `leading(fn, options?)`, `queue(fn, options?)` get an overload `(options?) => Wrapper`; `debounce(ms, fn, options?)` and `throttle(ms, fn, options?)` get `(ms, options?) => Wrapper`. At run time `typeof fn === "function"` picks the direct form. The options object has no call signature, so there is no ambiguity. Alternative considered: a separate name (`debounceOf`, `debounce.with`). Rejected: a second name per policy is a second thing to learn; the owner chose the same name.

**2. The wrapper is `<P, E, R>(fn: Task<P, E, R>) => Task<P, E, Result<R>>`**, with the result type the direct overload already has. It is implemented by calling the direct form, so there is one implementation of each policy and the wrapper is a closure of three lines. A shared helper (`src/policies/curry.ts`) is not needed unless the lines repeat to a point where it reads better; the tasks decide.

**3. `key` in the wrapper form.** In `debounce(300, { key: (q) => q.id })` the payload type cannot be inferred from the task that comes later. The overload is generic in `P` (`options: DebounceOptions<P>`) and `P` comes from the annotation of the parameter of `key`; with no annotation it is `unknown` (as `never` today would reject every task). Docs show the keyed case with the annotated parameter or the direct form. This is the one place where the curried form is weaker than the direct one, and it is stated, not hidden.

**4. `usePolicy` does not change in code.** A wrapper has the type of `make` already. The hook calls `make` once and again on `deps`, so `debounce(wait)` made on every render is cheap (it allocates a closure) and only the first one (or the one after a `deps` change) is used. Consequence: `deps` stays explicit, as today. `debounce(wait)` with `deps` left out ignores a later `wait` the same way `(task) => debounce(wait, task)` does. Auto-deps would need the wrapper to expose its arguments, which grows the policies for a hook-only need. Rejected for now ("complicating can be done later").

**5. Composition stays nesting.** `(task) => throttle(100, latest(task))` is still the way to combine, and it is the form the docs keep for that case. A `pipe(debounce(300), latest())` helper is plain to add later because wrappers are `Task -> Task` functions; it is not built now. Effects (`retry`, `timeout`, `poll`) take `ctx` first and run inside the callback, so they are not wrappers and do not join this change.

**6. `withPolicy` unchanged.** It takes a finished task: `withPolicy(debounce(300, fn))`. There is no `make` to replace.

**7. Lifecycle.** The wrapper calls the direct form, so `keyed()` marks the task and `job.wrap` reads the mark as before. No change to `lifecycle.ts`.

## Risks / Trade-offs

- **Overloaded signatures read worse in the editor.** Mitigation: a doc comment with an `@example` on each overload.
- **A task passed as `make` by mistake** (`usePolicy(cb, debounce(100, cb2))`) must fail the type check. `Task<P,E,R>` is `(payload, ctx) => R` and `make` is `(task) => Task`; the two parameter lists differ in count and kind. `types.test.ts` pins the error; if TypeScript accepts it, the tasks add a brand to the wrapper type.
- **Inference through a generic wrapper.** `usePolicy`'s `S` must be inferred from a generic function value. TypeScript 7 does higher-order inference for this shape; `types.test.ts` proves it, and if it fails the overloads of `usePolicy` are adjusted, not the policies.
- **Size.** Each policy gains a few bytes. Checked with `pnpm size` against the limits in `package.json`.

## Migration

None required: the direct forms and `(task) => ...` keep working. Docs and examples move to the new form. `CHANGELOG.md` under `Unreleased` lists it under `Added`.
