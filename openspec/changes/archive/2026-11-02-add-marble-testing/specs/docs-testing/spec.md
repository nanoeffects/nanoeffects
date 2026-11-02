# Spec Delta

## Purpose
A docs page that shows how to test a policy or an effect with diagrams, for a reader who writes tests and knows fake timers or RxJS marbles.

## ADDED Requirements

### Requirement: A testing page with a worked case
`docs/testing.md` SHALL state its level and what to read first, start from the problem (a time-based test with `advanceTimersByTime` numbers), show one worked case with `latest` (the emit diagram, the expected diagram and the failure message), explain the alphabet, the frame, the clock and the `frames` option in a table or a short list, state what is not supported, and say that the helper needs a tracer so it has no `notrace` build. Every `js` or `ts` block SHALL pass `pnpm docs:check`, and every name in a block SHALL be defined in it.

#### Scenario: A reader copies the case
- **WHEN** the worked case is copied into a Vitest file
- **THEN** it runs and passes

### Requirement: The page is listed everywhere
The English page, the Russian page `docs/ru/testing.md` with the same code blocks, the entry in `tools/docs-site/.vitepress/sidebar.ts` with its Russian title, the line in `llms.txt`, the entry `nanoeffects/testing` in `docs/package.md`, and a task line in `docs/recipes.md` (and its Russian page) SHALL exist, and `pnpm docs:check`, `pnpm llms:check` and `pnpm docs:site` SHALL pass.

#### Scenario: Checks
- **WHEN** the three commands run
- **THEN** they pass
