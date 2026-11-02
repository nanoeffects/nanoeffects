# Tasks

## 1. Name a listener by its function

- [x] 1.1 In `src/trace/plugin.ts`, use `fn.name` when no `traceId` is given and the name is not empty; an empty name returns the unwrapped path. Keep `once` and `off` working through `remember` and `forget`.
- [x] 1.2 Tests in `src/trace/plugin.test.ts`: declared function, anonymous arrow, `traceId` wins, `once`, `off`, no tracer, `notrace`; check the existing tests that read the type of a `run` task.
- [x] 1.3 Add a probe to `src/tests/plugin-matrix.test.ts` for the name, in every order with the other plugins.

## 2. describeBus

- [x] 2.1 Add `src/trace/listeners.ts` (the per-bus registry) and `src/trace/describe.ts` (`describeBus`), record in `plugin.ts` at `on`, `once`, `off`; export `describeBus` from `src/trace/index.ts` (re-export only).
- [x] 2.2 Tests: two events, action creator, `"*"`, `off` of one, of a key and of all, `once` after it ran, anonymous, no plugin, no tracer, 10 000 subscribe and unsubscribe leaves the registry empty.
- [x] 2.3 `pnpm build`, `pnpm size`: raise the `trace` limit only as far as measured; check `createBus` is unchanged and `pnpm smoke` passes on the `notrace` build.

## 3. Docs

- [x] 3.1 `docs/tracing.md`: the function-name rule next to "Name a listener", and "List who listens" with `describeBus`; the same in `docs/ru/tracing.md`.
- [x] 3.2 Write `docs/debugging-compared.md` and `docs/ru/debugging-compared.md` (level, comparison table, three cases, gaps; code blocks the same); add to `tools/docs-site/sidebar.ts` and `llms.txt`.
- [x] 3.3 `CHANGELOG.md` under `Unreleased`: `### Added` (`describeBus`) and `### Changed` (listener names).
- [x] 3.4 Run `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm docs:site && pnpm vitest run && pnpm build`, then `pnpm verify`.
