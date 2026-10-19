# Tasks

## 1. match on commands

- [x] 1.1 `createCommand` returns the command with `match(action)`, typed as a guard to `{ type: T; payload: P }`. Verify: unit tests in `src/actions/command.test.ts` for equal and different types, a job as a command, and a type test in `src/tests/types.test.ts` that `action.payload` is narrowed.

## 2. The job is the command

- [x] 2.1 `createJob` returns the command with `success` and `fail` added; the type `Job` becomes the command type with those two properties; options, made actions and defaults as now. Verify: tests for the shape, strings making creators, given creators being the same objects, and the default types.
- [x] 2.2 Routing is unchanged: the success and fail actions are emitted through the context of the task, an error is always handled, nothing is emitted after an abort, a missing handler throws `MissingHandlerError`. Verify: the routing tests of `src/actions/job.test.ts` pass on the new shape.
- [x] 2.3 Types: made actions carry the literal type and the awaited result type (success) or `unknown` (fail); a command or a plain object as an option is a type error. Verify: type tests with `@ts-expect-error` and `pnpm tsgo` clean.

## 3. Callers and docs

- [x] 3.1 Move the tests and examples that create a job (`command-trace.test.ts` if it does, `examples/modules.ts`, `docs/guide.md` if it mentions one). Verify: `pnpm vitest run` and `pnpm tsgo` pass.
- [x] 3.2 `docs/actions.md` (Commands and Jobs sections: `match`, `loadUser.success`), `CHANGELOG.md`, `AGENTS.md` if it names `createJob`. Verify: they match the code.

## 4. Verification

- [x] 4.1 `pnpm verify` passes. Verify: the command exits 0.
