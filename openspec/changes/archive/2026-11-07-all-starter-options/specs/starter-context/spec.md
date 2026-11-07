# Spec Delta

## MODIFIED Requirements

### Requirement: all and allSettled can limit how many starters run at once
`all(ctx, effects, options)`, `allSettled(ctx, effects, options)`, `all(effects, options)` and `allSettled(effects, options)` SHALL accept `options.concurrency`, a positive integer or `Infinity`. In the short form the options SHALL apply when a group calls the starter, in the child it gives. At most `concurrency` starters SHALL be running at once. When a running starter settles, the next starter in the order of `effects` SHALL start. Without the option, or with `Infinity`, all starters SHALL start at once, as before. The result SHALL have the same shape, order and values as without the option, for an array and for an object of starters.

#### Scenario: Five at a time
- **WHEN** `all(ctx, ids.map((id) => retry(() => loadUser(id))), { concurrency: 5 })` runs with 12 ids
- **THEN** no more than 5 calls of `loadUser` are in flight at any moment, and the result has 12 users in the order of `ids`

#### Scenario: An object of starters
- **WHEN** `all(ctx, { a, b, c }, { concurrency: 1 })` runs
- **THEN** `a`, `b` and `c` run one after another in that order, and the result is `{ a, b, c }` values

#### Scenario: No option
- **WHEN** `all(ctx, effects)` runs with no third argument
- **THEN** every starter starts at once, as before this change

#### Scenario: The short form is limited too
- **WHEN** `race(ctx, { loaded: all(ids.map((id) => load(id)), { concurrency: 2 }) })` runs with 6 ids
- **THEN** no more than 2 calls of `load` are in flight at any moment

#### Scenario: A wrong value is rejected in the short form
- **WHEN** a group calls `all(effects, { concurrency: 0 })`
- **THEN** it throws a `RangeError` before any starter starts, as in the `ctx` form
