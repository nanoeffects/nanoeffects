# Spec Delta

## MODIFIED Requirements

### Requirement: The call forms of retry, timeout and poll are permanent
`docs/effects.md` SHALL state that `retry`, `timeout` and `poll` have three call forms (with `ctx`, the Task form, and the starter form), that they are told apart by the arguments, and that all three stay. It SHALL state that `all` and `allSettled` take options in the short form too, how a two-argument call is told from the `ctx` form, and why `race` takes none.

#### Scenario: A reader asks why
- **WHEN** a reader looks up how `retry` can be called three ways
- **THEN** `docs/effects.md` lists the three forms and says they will not be removed

#### Scenario: A reader asks how all takes options without ctx
- **WHEN** a reader looks up `all(effects, { concurrency })`
- **THEN** `docs/effects.md` says the first argument tells the forms apart, and why `race` has no options
