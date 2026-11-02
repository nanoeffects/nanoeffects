# docs-debugging-cases Specification

## Purpose
A docs page with the cases that a developer meets when something goes wrong with a bus: who listens to an event, what began a chain and why a request stopped.

## Requirements

### Requirement: The page shows the cases of this library
`docs/debugging-cases.md` SHALL state its level and what to read first, show the cases "who listens to an event", "which task began a chain" and "why a request stopped" as runnable snippets with links to the pages that explain them, and list what is not there (no browser extension, no map from source code, no click-through from the log, no names from a compiler, no replay). It SHALL NOT compare nanoeffects with other libraries.

#### Scenario: No other libraries
- **WHEN** a reader opens the page
- **THEN** it names no other library and has no comparison table

### Requirement: The page is listed everywhere
The English page, the Russian page `docs/ru/debugging-cases.md` with the same code blocks, the entry in `tools/docs-site/.vitepress/sidebar.ts` with its Russian title, and the line in `llms.txt` SHALL exist, and `pnpm docs:check`, `pnpm llms:check` and `pnpm docs:site` SHALL pass.

#### Scenario: Checks
- **WHEN** the three commands run
- **THEN** they pass
