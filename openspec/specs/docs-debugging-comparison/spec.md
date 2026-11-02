# docs-debugging-comparison Specification

## Purpose
A docs page that tells a developer who knows RxJS, Effector or mitt what nanoeffects gives for tracing and debugging, where it is weaker, and which call answers which question.

## Requirements

### Requirement: The page compares honestly and shows the cases
`docs/debugging-compared.md` SHALL state its level and what to read first, compare nanoeffects with RxJS, Effector and mitt/nanoevents on what each gives for causes, cancellation, logs, a map of the app and tests, name the gaps (no browser extension, no static graph from source, no replay), and show the cases "who listens to this event", "which task began this chain" and "why did this request stop" as runnable snippets. It SHALL NOT claim a feature of another library that it cannot link to.

#### Scenario: Gaps are named
- **WHEN** a reader looks for what nanoeffects does not have
- **THEN** a section lists it

### Requirement: The page is in every place that lists pages
The English page, the Russian page `docs/ru/debugging-compared.md` with the same code blocks, an entry in `tools/docs-site/sidebar.ts` and a line in `llms.txt` SHALL exist, and `pnpm docs:check`, `pnpm llms:check` and `pnpm docs:site` SHALL pass.

#### Scenario: Checks
- **WHEN** the three commands run
- **THEN** they pass
