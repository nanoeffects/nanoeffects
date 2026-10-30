# Tasks

## 1. Baseline and type prototype

- [x] 1.1 Write a scratch benchmark (outside the repo) for a Task call, `bus.on("go", retry(task))` emitted in a loop, run it and keep the numbers; run `pnpm build && pnpm size` and note `effects (all)`
- [x] 1.2 Prototype the type of the returned function for `retry` (two signatures, the Task one last, the starter one only when `undefined extends P`); verify `pnpm tsgo` and the existing `types.test.ts` cases for `bus.on`, `latest`, `queue` and `ctx.run` with a Task stay green. If they do not, stop and update design.md decision 4

## 2. The shared check

- [x] 2.1 Add the check that tells a context from anything else and throws the `TypeError` of the forgotten context (in `src/effects/` or next to `isContext` in `src/utils/`); verify with a unit test that `retry(task)("payload")` throws, calls nothing and starts no timer

## 3. retry, timeout, poll as starters

- [x] 3.1 Add the starter branch and the overloads to `src/effects/retry.ts`; verify `retry.test.ts` and `retry-task.test.ts` pass unchanged and a new test shows `race(ctx, { a: retry(fn, { times: 3 }), b: delay(…) })` retries, and the loser stops its next attempt
- [x] 3.2 Add the same to `src/effects/timeout.ts`; verify `timeout.test.ts` and `timeout-task.test.ts` pass unchanged and a new test shows `all(ctx, { a: timeout(100, fn) })` rejects with `TimeoutError` and aborts `fn`
- [x] 3.3 Add the same to `src/effects/poll.ts`; verify `poll.test.ts` and `poll-task.test.ts` pass unchanged and a new test shows `race(ctx, { a: poll(100, fn), b: take("leave") })` polls until `leave` and leaves no timer
- [x] 3.4 Add the Task-call cases of the spec: a payload that is a context with two arguments stays a Task call, `latest(retry(task))` and `ctx.run(retry(task), payload)` unchanged; verify `pnpm vitest run src/effects src/policies`
- [x] 3.5 Add cases to `src/tests/types.test.ts`: the starter is accepted when the function takes no payload, rejected with a `string` payload (`@ts-expect-error` above the line the checker reports), the result type of the key is the awaited result; verify `pnpm tsgo`

## 4. Trace and plugins

- [x] 4.1 Add a test in `src/effects/starter-context.test.ts` with the recorder: the starter form of each of the three gives the same events (same parents, `rootId`, `traceGroupId`, phases) as the wrapper `(child) => effect(child, …)`
- [x] 4.2 Verify `src/tests/plugin-matrix.test.ts`, `architecture.test.ts` and `exports.test.ts` pass, and that `effectsPlugin({ retry, timeout, poll })` binding still calls the `ctx` form

## 5. Docs and examples

- [x] 5.1 In `docs/effects.md` add the Task of `retry` / `timeout` / `poll` to the paragraph about ready-made starters, with the example `race(ctx, { user: retry((_, { signal }) => fetchUser(id, { signal }), { times: 3 }), waited: delay(5000) })` and a sentence on why the first argument is `_`; verify `pnpm docs:check && pnpm llms:check`
- [x] 5.2 Replace `(child) => retry(child, …)`, `(child) => timeout(child, …)` and `(child) => poll(child, …)` in groups of `docs/` and `examples/`, for example the polling in `docs/migrating-from-rxjs.md`; verify `pnpm tsgo && pnpm check`
- [x] 5.3 Add an `### Added` bullet under `## Unreleased` in `CHANGELOG.md` (one or two lines, link to `docs/effects.md`)

## 6. Measure and verify

- [x] 6.1 Run the benchmark of 1.1 again and compare; run `pnpm build && pnpm size`; raise the `effects (all)` limit in `package.json` to the measured need plus a small margin and put both numbers in the commit message
- [x] 6.2 Run `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm vitest run && pnpm build`, then `pnpm verify`; all pass

## Workflow follow-up

- Archive the change (`/opsx:archive`) after review; the delta is added to `openspec/specs/effect-starters/spec.md`.
- Do not commit unless the owner asks.
