## Purpose
Say which parts of the package the 1.0 promise covers, what counts as a breaking change, which environments are supported, and keep the list of exports of each entry visible in tests.

## ADDED Requirements

### Requirement: Every entry is marked stable or unstable
`docs/stability.md` SHALL list every entry of `package.json` `exports` (`.`, `effects`, `policies`, `actions`, `scope`, `match`, `signal`, `context`, `oop`, `trace`, `redux`, `observable`, `react`, `svelte`, `vue`, `dev`) as stable or unstable, with one line on what each mark means. The stable entries SHALL be `.`, `effects`, `policies`, `actions`, and the contract of `trace` (`Tracer`, `TraceEvent`, `Trace`, `TraceLogger`, `Phase`, `EffectName`, `tracePlugin`). Every other entry SHALL be unstable, and `reduxDevtools` with its option types SHALL be named as unstable inside `trace`. The page SHALL be linked from the docs index and `llms.txt`, and SHALL NOT be linked from the README.

#### Scenario: A reader looks up an entry
- **WHEN** a reader opens `docs/stability.md` and looks for `nanoeffects/oop`
- **THEN** the page says it is unstable and what that allows

#### Scenario: A new entry
- **WHEN** an entry is added to `exports` and not to the page
- **THEN** a test fails, naming the entry

### Requirement: The semver policy says what is breaking
`docs/stability.md` SHALL state that, for a stable entry, a change to the runtime behavior of a call, to a type that stops code which compiled before from compiling, or to the set of exports is breaking and ships in a major version (before 1.0, in a minor with a `### Breaking` note). It SHALL state that unstable entries, the text of dev diagnostics, and the payload details of trace events are not covered, and that a change to them is noted in the CHANGELOG. It SHALL state that a deprecated export is removed only in a major version, and that 1.0.0 is the next major version after 0.x.

#### Scenario: A stricter inference
- **WHEN** a release makes the type of a call more exact and code that was already wrong no longer compiles, while all correct code still does
- **THEN** it ships in a minor release with a CHANGELOG note and is not marked breaking

#### Scenario: A deprecated name
- **WHEN** `RaceStarter` is deprecated in 0.26.0
- **THEN** it still works in every 0.26.x and later 0.x release, and may be removed in 1.0.0, with a `### Breaking` note

### Requirement: The supported environments are written down
`docs/stability.md` SHALL list the supported Node versions (the library: 18, 20, 22 and 24, as in CI; the dev tools in `nanoeffects/dev` and the trace in a real browser: 22 and later), the tested TypeScript versions (5.9 and 7), and the peer ranges of `react`, `svelte` and `vue` as they are in `package.json`. The numbers on the page SHALL match `package.json` and the CI matrix.

#### Scenario: A peer range changes
- **WHEN** a peer range in `package.json` changes
- **THEN** the page is updated in the same change

### Requirement: The call forms of retry, timeout and poll are permanent
`docs/effects.md` SHALL state that `retry`, `timeout` and `poll` have three call forms (with `ctx`, the Task form, and the starter form), that they are told apart by the arguments, and that all three stay. It SHALL state why `all` and `allSettled` take options in the `ctx` form only and why `race` takes none.

#### Scenario: A reader asks why
- **WHEN** a reader looks up how `retry` can be called three ways
- **THEN** `docs/effects.md` lists the three forms and says they will not be removed

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
