# Tasks

## 1. Export the tracing types from the trace entry

- [x] 1.1 Search `src`, `docs`, `examples`, `integration`, `skills`, `scripts` and `README.md` for the names that will leave the root (`Tracer`, `Trace`, `TraceEvent`, `TraceLogger`, `Phase`, `EffectName`, `anyEventType`, `commandCall`, `ContextTask`, `NoClash`) imported from `nanoeffects` or `./index`; write the list of places in the notes of this task. Verify the list is complete by grepping again after the changes
- [x] 1.2 Add the type re-exports of `Tracer`, `Trace`, `TraceEvent`, `TraceLogger`, `Phase` and `EffectName` to `src/trace/index.ts`. Verify `pnpm tsgo`
- [x] 1.3 Add type checks to `src/tests/types.test.ts`: the six types import from `nanoeffects/trace`, a logger typed with the trace `TraceLogger` is accepted by `createTracer`, and the type parameter is kept. Verify `pnpm tsgo`

## 2. Clean up the root entry

- [x] 2.1 Remove `Tracer`, `Trace`, `TraceEvent`, `TraceLogger`, `Phase` and `EffectName` from `src/index.ts`, and fix every import found in 1.1. Verify `pnpm tsgo` and `src/tests/architecture.test.ts`
- [x] 2.2 Remove `anyEventType` and `commandCall` from `src/index.ts`, and change `src/tests/exports.test.ts` so the root lists `["createBus"]`. Verify `pnpm vitest run src/tests/exports.test.ts`
- [x] 2.3 Remove `ContextTask` and `NoClash` from `src/index.ts` (they stay in `src/context/index.ts`), and fix every import found in 1.1. Verify `pnpm tsgo`
- [x] 2.4 Add `@ts-expect-error` checks to `src/tests/types.test.ts` that each removed name is not importable from the root, and positive checks that `Bus`, `BusOptions`, `Context` and `WithContext` still are. Verify `pnpm tsgo`

## 3. Verify the package

- [x] 3.1 Run `pnpm build && pnpm lint:package`: the declarations of every entry resolve, `dist/trace.d.ts` exports the six types, `dist/index.d.ts` does not, and a signature that names `NoClash` or `Tracer` still resolves. Verify `pnpm size` is unchanged for `trace` and `createBus`, and run `pnpm test:integration`
- [x] 3.2 Run `pnpm consumer-check` against a tarball of the build (`pnpm pack`, then `pnpm consumer-check <tarball>`): a clean project type-checks and runs the README example. Verify it passes

## 4. Docs and changelog

- [x] 4.1 Change the import of the custom logger example in `docs/tracing.md` to `nanoeffects/trace`, fix every page or example found in 1.1, and update the sentence in `AGENTS.md` that says what the main entry has (and the line about `NoClash` and `ContextTask`, if any). Verify `pnpm docs:check` and `pnpm llms:check`
- [x] 4.2 Add the `CHANGELOG.md` entries under `## Unreleased` (create the heading above the latest version if it is missing): `### Breaking`, the six tracing types are imported from `nanoeffects/trace`, `ContextTask` and `NoClash` from `nanoeffects/context`, and `anyEventType` and `commandCall` are gone; `### Added`, the trace types are importable from `nanoeffects/trace`. Then run `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm vitest run && pnpm build`

## Workflow follow-up

- Release as `0.16.0` (a minor in 0.x with a `### Breaking` section) with the steps of `AGENTS.md`; the version bump is not part of this change.
- Archive the change with `/opsx:archive` after the review.
