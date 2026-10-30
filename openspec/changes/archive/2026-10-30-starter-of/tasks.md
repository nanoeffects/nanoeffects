# Tasks

## 1. The type

- [x] 1.1 Add `StarterOf<E, R = unknown>` as `Starter<R, Context<E>>` to `src/effects/run.ts` with a doc comment and an `@example`, and export it from `src/effects/index.ts`; verify `pnpm tsgo`
- [x] 1.2 Add cases to `src/tests/types.test.ts`: a stored `all` and `retry` accepted by `race`, the result type with `R`, the wrong `R` as `@ts-expect-error` above the line the checker reports, an inline starter with no annotation; verify `pnpm tsgo`

## 2. Use and docs

- [x] 2.1 Replace the `(child: Child) => …` annotations and the local `Child` type in `src/effects/starter-group.test.ts` with `StarterOf<TestEvents>`; verify `pnpm vitest run src/effects/starter-group.test.ts`
- [x] 2.2 In `docs/effects.md`, change the stored-starter notes (the `take` and the group ones) to show `StarterOf`, and say that an inline starter needs none; verify `pnpm docs:check && pnpm llms:check`
- [x] 2.3 Add an `### Added` bullet under `## Unreleased` in `CHANGELOG.md` (one line, link to `docs/effects.md`)

## 3. Verify

- [x] 3.1 Run `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm vitest run && pnpm build`; confirm `pnpm size` is unchanged

## Workflow follow-up

- Archive the change (`/opsx:archive`) after review; the delta is added to `openspec/specs/effect-starters/spec.md`.
- Do not commit unless the owner asks.
