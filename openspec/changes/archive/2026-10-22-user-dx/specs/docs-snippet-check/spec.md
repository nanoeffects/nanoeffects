# docs-snippet-check Specification

## Purpose
Keep the code blocks of the user documentation true: a block that no longer matches the library fails a check instead of misleading a reader.

## ADDED Requirements

### Requirement: Code blocks of the docs are type-checked
The check SHALL type-check every `js`, `javascript`, `ts` and `typescript` fenced block of `docs/*.md` against the library source, resolving `nanoeffects` and `nanoeffects/<entry>` imports to `src`. Each block SHALL be checked on its own, so a name defined in one block is not visible in another.

#### Scenario: A correct block passes
- **WHEN** a block imports `createBus` from `nanoeffects` and calls `bus.on` and `bus.emit` with valid arguments
- **THEN** the check reports no error for it

#### Scenario: A block that uses a removed API fails
- **WHEN** a block imports a name that `nanoeffects` no longer exports
- **THEN** the check fails and the report names the page, the line of the fence and the TypeScript error

#### Scenario: Blocks do not share names
- **WHEN** a block uses `bus` but defines it only in an earlier block of the same page
- **THEN** the check reports `bus` as not found, which shows the snippet is not self-contained

### Requirement: A plain JavaScript block reports only stale names
A block in `js` or `javascript` SHALL be reported only for errors that show the snippet no longer matches the library or is incomplete: a syntax error, a name, export or module that is not found, a name declared twice, an unknown option, a wrong argument count. Errors about payload types SHALL NOT be reported for it, since a JavaScript reader has no types. A `ts` or `typescript` block SHALL be reported for every error.

#### Scenario: Untyped payload in a js block
- **WHEN** a `js` block destructures `{ x }` from the payload of a handler on `createBus()`
- **THEN** the check reports no error for it

#### Scenario: The same code in a ts block
- **WHEN** the same code is in a `ts` block
- **THEN** the check reports the payload type error

### Requirement: External names are declared once
Names that a snippet takes from the reader's application (such as `api` or `report`) SHALL be declared in one stub file, as values of loose types, and SHALL be visible to every checked block. A name that is not declared there and not defined in the block SHALL be an error.

#### Scenario: A declared external name
- **WHEN** a block calls `api.search(query, { signal })` and `api` is declared in the stub file
- **THEN** the check reports no error for that call

#### Scenario: An undeclared name
- **WHEN** a block uses `fetchUsers`, which is neither defined in the block nor declared in the stub file
- **THEN** the check fails and the report names `fetchUsers`

### Requirement: A block can opt out
A fenced block directly preceded by the line `<!-- docs-check: skip -->` SHALL NOT be checked, and the report SHALL count skipped blocks. Fences of other languages (`bash`, `json`, `text`, and the like) SHALL be ignored.

#### Scenario: A skipped block
- **WHEN** a block with a type error follows the skip marker
- **THEN** the check passes for it and the summary lists one skipped block

#### Scenario: A shell block
- **WHEN** a page has a `bash` fence with `npm install nanoeffects`
- **THEN** the check does not read it

### Requirement: The check is a command and part of the gates
`pnpm docs:check` SHALL exit with a non-zero status when any checked block has an error, and with zero when none has. It SHALL be part of `pnpm verify` and of the CI job.

#### Scenario: All blocks pass
- **WHEN** `pnpm docs:check` runs on a docs tree where every block is valid or skipped
- **THEN** it prints the number of checked and skipped blocks and exits with 0

#### Scenario: One block fails
- **WHEN** one block has a type error
- **THEN** the command prints that error with the page and line, and exits with a non-zero status

#### Scenario: The check leaves no files behind
- **WHEN** the command finishes, with success or with failure
- **THEN** the working tree has no new files from it (generated modules live in a temporary directory that is removed)
