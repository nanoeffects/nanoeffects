# public-surface Specification

## Purpose
Keep the call forms, the exports of each entry and the public types of the package pinned by tests, and record what is deprecated.

## Requirements

### Requirement: The call forms of retry, timeout and poll are permanent
`docs/effects.md` SHALL state that `retry`, `timeout` and `poll` have three call forms (with `ctx`, the Task form, and the starter form), that they are told apart by the arguments, and that all three stay. It SHALL state that `all` and `allSettled` take options in the short form too, how a two-argument call is told from the `ctx` form, and why `race` takes none.

#### Scenario: A reader asks why
- **WHEN** a reader looks up how `retry` can be called three ways
- **THEN** `docs/effects.md` lists the three forms and says they will not be removed

#### Scenario: A reader asks how all takes options without ctx
- **WHEN** a reader looks up `all(effects, { concurrency })`
- **THEN** `docs/effects.md` says the first argument tells the forms apart, and why `race` has no options

### Requirement: The exports of each entry are pinned by tests
A test SHALL list the runtime exports of every entry and fail on a name that is added or removed. A second test SHALL list the type exports of every entry and fail the same way. A change to the surface SHALL therefore appear as a change to a test file.

#### Scenario: A new export
- **WHEN** a function is exported from `nanoeffects/effects` and the list is not updated
- **THEN** the runtime test fails with the added name

#### Scenario: A type is dropped
- **WHEN** `StarterOf` stops being exported from `nanoeffects/effects`
- **THEN** the type test fails with the missing name

### Requirement: RaceStarter is deprecated in favour of StarterOf
`RaceStarter` SHALL stay exported with a `@deprecated` note that points to `StarterOf`, and SHALL work as before.

#### Scenario: A user of RaceStarter
- **WHEN** code imports `RaceStarter` from `nanoeffects/effects`
- **THEN** it compiles and behaves as before, and the editor shows the deprecation

### Requirement: The public types do not name Command
A test SHALL read the type declarations of every entry of the package and fail when a declared or exported name contains `Command`. The old names `Command` and `CommandCall` SHALL NOT be exported, with no alias, and the removal SHALL be listed under `### Breaking` in `CHANGELOG.md`.

#### Scenario: A name comes back
- **WHEN** a type named `CommandResult` is exported from `nanoeffects/actions`
- **THEN** the test fails and names it

#### Scenario: The renamed types
- **WHEN** the type exports of the root entry are listed
- **THEN** the list has `Handled` and `HandledCall` and neither `Command` nor `CommandCall`
