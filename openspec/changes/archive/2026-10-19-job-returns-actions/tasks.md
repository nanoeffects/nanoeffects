# Tasks

## 1. The new shape

- [x] 1.1 `createJob` returns `{ command, successAction, failAction }`, with the options `success` and `fail`; strings make action creators with `createAction`, given creators are used and returned as they are, omitted options get the defaults `${type}/success` and `${type}/fail`. Verify: unit tests for the return shape, made actions (type and payload), given creators returned as the same object, and the default types.
- [x] 1.2 Routing: the success and fail actions are emitted through the context of the task after the handler settles, an error is always handled (the promise resolves with `undefined`), nothing is emitted after an abort, a missing handler throws `MissingHandlerError` and is not routed. Remove the command and plain-object targets from `send`. Verify: the existing routing tests of `src/actions/job.test.ts`, moved to the new shape, pass.
- [x] 1.3 Types: made actions carry the literal type and the awaited result type (success) or `unknown` (fail); a command or a plain object as a target is an error. Verify: type tests in `src/tests/types.test.ts` with `@ts-expect-error`, and `pnpm tsgo` clean.

## 2. Tests

- [x] 2.1 Move `src/actions/job.test.ts` and any test that creates a job (`command-trace.test.ts`) to the new shape and the option `success`. Verify: `pnpm vitest run src/actions` passes.
- [x] 2.2 Tests that the actions go through the bus: a listener of `successAction` gets the result, a listener of `failAction` gets the error, the promise of the command resolves with the result or with `undefined`, nothing is emitted after an abort. Verify: the tests pass.

## 3. Docs

- [x] 3.1 `docs/actions.md` (the Jobs section), `examples/modules.ts` and `docs/guide.md` if it mentions a job show `const { command, successAction, failAction } = createJob(...)`, strings and creators, the defaults, and that an error is always handled. Verify: `pnpm tsgo` type-checks the examples and `src/tests/guide.test.ts` passes.
- [x] 3.2 `CHANGELOG.md` and `AGENTS.md` if it names `createJob`. Verify: they match the docs.

## 4. Verification

- [x] 4.1 `pnpm verify` passes. Verify: the command exits 0.

## Workflow follow-up

- After apply: `openspec archive job-returns-actions` moves the delta into `openspec/specs/job-outcomes/`.
