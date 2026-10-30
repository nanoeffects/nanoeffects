## Why

`delay` and `take` already work as starters of `race`, `all` and `allSettled` without a wrapper (change `curried-starters`). `retry`, `timeout` and `poll` do not: their form without `ctx` returns a Task, `(payload, ctx) => result`, and a group calls a starter with one argument, the child context. So `race(ctx, { user: retry(fetchUser) })` fails (the Task gets `ctx` undefined), and the reader writes `(child) => retry(child, () => fetchUser(id, { signal: child.signal }), { times: 3 })` next to `delay(5000)`.

## What Changes

- The Task returned by `retry(task, options)`, `timeout(ms, task)` and `poll(ms, task, options)` also works as a starter. Called with one argument, a child context (no second argument), it runs as the `ctx` form with that child as its context and calls the wrapped function as `task(undefined, child)`.
- Called as `(payload, ctx)` it is unchanged, so `bus.on`, `latest(...)`, `ctx.run(...)` and every other use of a Task keep their behavior.
- A call with one argument that is not a context (for example `retry(task)(payload)` by hand) throws a `TypeError` that says the Task needs `(payload, ctx)` or a context. Today the same call fails with a less clear error.
- The type of the returned function is accepted as a Task and as a starter. The starter side exists only when the wrapped function accepts `undefined` as its payload.
- Docs show `race(ctx, { user: retry(loadUser, { times: 3 }), waited: delay(5000) })` and keep the `ctx` forms for plain handler code.
- **Not breaking**: no call that works today changes its result or its type.

Out of scope: a new name or a wrapper function; `all`, `allSettled` and `race` as starters of other groups; `take` and `delay` (done); a payload for the starter form.

## Capabilities

### New Capabilities

<!-- None. -->

### Modified Capabilities

- `effect-starters`: the Task of `retry`, `timeout` and `poll` is a starter as well. Added requirements, no change to the existing ones.

## Impact

- Code: `src/effects/retry.ts`, `timeout.ts`, `poll.ts` (the Task branch of each, and the overload types); one small shared helper in `src/effects/` or `src/utils/` that tells the starter call from the Task call and throws the `TypeError`.
- Types: overloads of the returned function; `src/tests/types.test.ts` (inference of `bus.on(…, retry(task))`, `latest(retry(task))`, `ctx.run(retry(task))` must not change).
- Tests: next to each effect, a trace test through the recorder, a case in `starter-context.test.ts`.
- Docs: `docs/effects.md`; `CHANGELOG.md` under `Unreleased`; examples that write `(child) => retry(child, …)` inside a group.
- Size: `effects (all)` is at its 2.5 kB limit, so the limit is raised to the measured need; the numbers go into the commit message.
- Public API: additive, a minor release.
