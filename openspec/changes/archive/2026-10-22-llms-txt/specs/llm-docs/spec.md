# llm-docs Specification

## Purpose
Give AI assistants two entry points to the documentation of the package, a short index and the full text, so that code written with their help uses the real API.

## ADDED Requirements

### Requirement: llms.txt indexes the documentation
The package SHALL contain `llms.txt` at its root, in Markdown: a first-level heading with the package name, a short summary, and sections of links to the pages of `docs/`, each with a one-line description. Every `docs/*.md` page except `docs/README.md` (the index for people) SHALL be linked from it exactly once, and every link to a page of the package SHALL point to a file that exists.

#### Scenario: Every page is linked
- **WHEN** a page `docs/new-topic.md` exists and `llms.txt` does not link to it
- **THEN** `pnpm llms:check` fails and names `docs/new-topic.md`

#### Scenario: A dead link
- **WHEN** `llms.txt` links to `docs/removed.md`, which does not exist
- **THEN** `pnpm llms:check` fails and names the link

#### Scenario: Pages in reading order
- **WHEN** `llms.txt` is read from top to bottom
- **THEN** the guide comes before the references, and a page for a later project level comes after the pages for earlier ones

### Requirement: llms.txt states the rules assistants get wrong
The summary of `llms.txt` SHALL state, in a few lines, the facts that decide whether generated code works: the package is ESM only, effects take `ctx` as the first argument, `bus.on` returns the unsubscribe function, and each entry is imported from its own path (`nanoeffects/policies`, `nanoeffects/effects`, `nanoeffects/actions`).

#### Scenario: The summary matches the package
- **WHEN** the entries named in the summary are compared with the `exports` of `package.json`
- **THEN** each named entry exists in `exports`

### Requirement: llms-full.txt is the documentation in one file
`llms-full.txt` SHALL be generated, not written by hand, and SHALL contain the text of every page that `llms.txt` links to, in the order of the links, each preceded by a line that names its source file. It SHALL start with the summary of `llms.txt`. A page SHALL appear as it is in `docs/`, without a change of its code or text.

#### Scenario: Content and order
- **WHEN** `llms-full.txt` is generated
- **THEN** it holds the summary, then each linked page in link order, each after a `Source: docs/<name>.md` line

#### Scenario: Regenerating gives the same file
- **WHEN** the generator runs twice on the same tree
- **THEN** both outputs are byte-identical

### Requirement: Both files are built and published
`pnpm build` SHALL produce `llms-full.txt`, and `package.json` `files` SHALL include `llms.txt` and `llms-full.txt`. The generated file SHALL NOT be committed.

#### Scenario: The packed package
- **WHEN** `pnpm pack --dry-run` runs after `pnpm build`
- **THEN** the list has `llms.txt`, `llms-full.txt` and the `docs/` pages

#### Scenario: A clean checkout
- **WHEN** the repository is cloned and `pnpm build` runs
- **THEN** `llms-full.txt` exists, and `git status` shows it as ignored

### Requirement: The check is part of the gates
`pnpm llms:check` SHALL exit with a non-zero status for a missing page, a dead link or an unreadable `llms.txt`, and with zero otherwise. It SHALL run in `pnpm verify` and in CI.

#### Scenario: A consistent tree
- **WHEN** every docs page is linked once and every link resolves
- **THEN** the command exits with 0
