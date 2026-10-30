# Proposal

## Why

`usePolicy(callback, make, deps)` asks the reader to write `(task) => debounce(1000, task)`. `task` and the user's own callback have the same type, so `(task) => debounce(1000, callback)` compiles, and it silently runs the callback of the first render: the stale closure that `usePolicy` exists to prevent. The wrapper `(task) => ...` is also noise that every call repeats.

## What Changes

- Every library policy (`latest`, `leading`, `debounce`, `throttle`, `queue`) can be called **without the task** and then returns a wrapper `(task) => policy`. `debounce(1000)` is that wrapper, `latest()` too, `queue({ key })` too. The forms with the task stay as they are.
- `usePolicy(callback, debounce(1000), [])` is the new way to write the hook. `usePolicy` itself does not change: a wrapper is already a valid `make`, and the form `(task) => ...` keeps working (for example for `(task) => throttle(100, latest(task))`).
- Docs and examples that use `usePolicy` show the new form; `docs/policies.md` explains the two ways to call a policy.

Out of scope: ready-made hooks (`useDebounce`), a `pipe` helper to combine wrappers (nesting stays the way: `(task) => throttle(100, latest(task))`), a change to `withPolicy` (it takes a task, so it has no use for a wrapper), and the effects (`retry`, `timeout`, `poll` take `ctx` first and are not wrappers of a task).

## Capabilities

### New Capabilities
- `curried-policies`: the call of a policy without a task that returns a wrapper of a task, for all library policies.

### Modified Capabilities
- `use-policy-hook`: `make` may be a wrapper from a curried policy.

## Impact

- `src/policies/{latest,leading,debounce,throttle,queue}.ts` (overloads, a small shared helper), their tests, `src/tests/types.test.ts`.
- `src/react/use-policy.ts` (doc comment only), `src/react/use-policy.test.ts`.
- `docs/{policies,react,starter,debounce-and-abort,prevent-double-submit}.md`, `examples/`, `README.md` if it shows `usePolicy`, `CHANGELOG.md` under `Unreleased`.
- Size of `nanoeffects/policies` grows a little (measured with `pnpm size`); `createBus` and `src/core` are untouched.
