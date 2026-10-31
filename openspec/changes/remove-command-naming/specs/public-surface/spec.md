## ADDED Requirements

### Requirement: The public types do not name Command
A test SHALL read the type declarations of every entry of the package and fail when a declared or exported name contains `Command`. The old names `Command` and `CommandCall` SHALL NOT be exported, with no alias, and the removal SHALL be listed under `### Breaking` in `CHANGELOG.md`.

#### Scenario: A name comes back
- **WHEN** a type named `CommandResult` is exported from `nanoeffects/actions`
- **THEN** the test fails and names it

#### Scenario: The renamed types
- **WHEN** the type exports of the root entry are listed
- **THEN** the list has `Handled` and `HandledCall` and neither `Command` nor `CommandCall`
