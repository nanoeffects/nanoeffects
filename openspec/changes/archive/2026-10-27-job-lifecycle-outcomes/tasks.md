# Tasks: job-lifecycle-outcomes

## 1. Gate: emit after an abort
- [x] 1.1 Measure `createBus` (rolldown, gzip) and `pnpm size` as the baseline. Add the symbol-keyed ungated emit to `createTask` in `src/core/context.ts` (option 1 of `design.md`), with a test in `context.test.ts`: it emits after an abort only while the key is set, keeps the `emitter` link for tracing, and is not on the public `Context` type. Measure again. The first version took `createBus` to 1334 bytes; it was optimized back to 1293 bytes, so the 1.3 kB limit stays (the `actions` limit goes to 2.7 kB). The ungated emit became a gate: the context lets one emit through while `ctx[emitAfterAbort]` is set, and the test is written for that. Verify: `pnpm vitest run src/core && pnpm size`

## 2. Outcomes in createJob
- [x] 2.1 `pending` and `cancel` in `src/actions/job.ts`: the outcomes object, the defaults `<type>/pending` and `<type>/cancel`, the properties of the job, `pending` sent in `route` before the handler is called, `cancel` chosen when the task is aborted at the settle (it wins over `fail`), exactly one closing outcome, a throwing `cancel` listener does not reject the promise. Tests in `job.test.ts` for every scenario of `job-outcomes`: defaults, strings, given creators, success, fail, abort with a rejecting handler and with one that ignores the signal, no listener, the flag scenario with `ctx.abort()`, a throwing `pending` listener. Verify: `pnpm vitest run src/actions/job`
- [x] 2.2 Flows in `src/tests/`: `job.wrap` with `commands.handle` (pending, then a closing outcome), a job without a handler (nothing sent), a scope on the job reaching the new outcomes, and the behavior under `leading` and `latest` pinned as the spec describes it (every call sends `pending`, a dropped or replaced call closes with `success(undefined)`). Verify: `pnpm vitest run src/tests`
- [x] 2.3 Types: `Job` parameters for the two outcomes with defaults, payload types, a plain object as a target is an error (a command was never one: `Outcome` accepts any creator-shaped function). Cases in `src/tests/types.test.ts`. Verify: `pnpm tsgo`
- [x] 2.4 Trace: the `cancel` action appears with the aborted task as its parent, and the trace phase `cancel` is unchanged. `cancel` and `pending` keep the causal link (a command emitted from their listener has a parent; the listener tasks themselves are not events of the trace). Test next to `command-trace.test.ts`. Verify: `pnpm vitest run src/actions`

## 3. Documentation
- [x] 3.1 JSDoc of `createJob` (four outcomes, `@example` with a loading flag), and a section "Show a loading state" in `docs/actions.md`: problem (a flag by hand with `try/finally` breaks on abort), when to use the outcomes, what each call does, the code (JS, one step per line, a comment on each nanoeffects call), and the limit that policies are not known to the job (a flag is reliable without a policy and for an abort of the task or of its parent). Update the `effect.pending` row and the "No `pending`" note of `docs/migrating-from-effector.md`. Verify: `pnpm docs:check && pnpm llms:check`
- [x] 3.2 `examples/` gets the loading-flag case if a recipe file fits (type-checked; none of the files fits a job, and the docs section is type-checked by `docs:check`, so none was added); `CHANGELOG.md` `Unreleased`: new outcomes, defaults, calls that do not start, no change for old jobs. Verify: read the entry

## 4. Verify
- [x] 4.1 `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm vitest run && pnpm build`, then `pnpm size` (core within its limit) and `pnpm verify`. Verify: all green

## Workflow follow-up
- Archive with `/opsx:archive`. Policies that tell the job when a call starts or is dropped, and `job.status()`, are separate changes.
