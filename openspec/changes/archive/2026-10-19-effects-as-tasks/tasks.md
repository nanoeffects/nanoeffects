# Tasks

## 1. Shared body

- [x] 1.1 `runTraced` passes the child context to its function (`fn(childCtx)`); the existing callers ignore it. Verify: `pnpm vitest run src/effects` passes unchanged.
- [x] 1.2 Split each of `retry`, `timeout` and `poll` into an internal function over a body `(childCtx) => result` and the existing `ctx` form that calls it. Verify: all existing tests of the three effects pass unchanged, including the trace tests.

## 2. retry as a Task

- [x] 2.1 `retry(task, options)` returns a Task that runs the shared body with `task(payload, childCtx)`; the form is chosen by `typeof` of the first argument. Verify: tests for attempts, `delay`, `shouldRetry`, last error, and equivalence with the `ctx` form.
- [x] 2.2 Tests: abort of the caller stops the attempts and the delay; `latest(retry(task))` aborts the older attempt and starts no retry; fields of the bus `context` are in the attempt context; trace has one `retry` group with a `run` child per attempt.

## 3. timeout as a Task

- [x] 3.1 `timeout(ms, task)` returns a Task; the Task gets the child context whose `signal` aborts on the limit. Verify: tests for `TimeoutError`, abort of the Task signal, result in time, `Infinity` and `ms` over 2^31, abort of the caller.
- [x] 3.2 Tests: `retry(timeout(ms, task))` retries after a timeout; the trace has the `timeout` group and its `run` child.

## 4. poll as a Task

- [x] 4.1 `poll(ms, task, options)` returns a Task; `ms` can be a number or a function of the call number. Verify: tests for the rate, `leading`, `waitForFn`, an error of the Task that stops polling, and an abort that ends it without an error.
- [x] 4.2 Tests: the timer is cleared on abort (no timer left under fake timers).

## 5. Types

- [x] 5.1 Overloads for the three effects. Verify: `pnpm tsgo` clean.
- [x] 5.2 Type tests in `src/tests/types.test.ts` for both forms: inference of `P` and `E` inside `latest(retry(timeout(...)))`, the result type of `await ctx.run(retry(task), payload)`, and `@ts-expect-error` for a wrong first argument and wrong options.

## 6. Composition

- [x] 6.1 Test of the composition `debounce(300, latest(retry(timeout(5000, task), { times: 3 })))` on a bus with fake timers: debounce, supersede, retry after a timeout. Verify: the test passes.
- [x] 6.2 Test that `ctx.run(retry(task), payload)` returns the result, passes the payload, and is aborted with the handler.

## 7. Docs and examples

- [x] 7.1 `docs/guide.md` steps 6 to 8 and `examples/guide.ts` show the Task form in `on(...)` and with `ctx.run`, and the `ctx` form for one call inside a body. Verify: `src/tests/guide.test.ts` passes and `pnpm tsgo` type-checks the examples.
- [x] 7.2 `docs/effects.md` describes both forms and when to use each; `CHANGELOG.md` lists the Task form under `0.1.0`. Verify: links and code blocks match the examples.

## 8. Size and verification

- [x] 8.1 Measure `pnpm size`; `createBus` stays within 1.2 kB; raise the `effects` limit only if the measured size needs it, and say so in the CHANGELOG. Verify: `pnpm size` passes.
- [x] 8.2 `pnpm verify` passes (types, lint, tests, build, integration, smoke, package checks, size). Verify: the command exits 0.

## Workflow follow-up

- After apply: `openspec archive effects-as-tasks` moves the delta into `openspec/specs/effect-composition/`.
