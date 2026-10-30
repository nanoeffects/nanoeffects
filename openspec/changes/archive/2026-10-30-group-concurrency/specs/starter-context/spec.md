## ADDED Requirements

### Requirement: all and allSettled can limit how many starters run at once
`all(ctx, effects, options)` and `allSettled(ctx, effects, options)` SHALL accept `options.concurrency`, a positive integer or `Infinity`. At most `concurrency` starters SHALL be running at once. When a running starter settles, the next starter in the order of `effects` SHALL start. Without the option, or with `Infinity`, all starters SHALL start at once, as before. The result SHALL have the same shape, order and values as without the option, for an array and for an object of starters.

#### Scenario: Five at a time
- **WHEN** `all(ctx, ids.map((id) => retry(() => loadUser(id))), { concurrency: 5 })` runs with 12 ids
- **THEN** no more than 5 calls of `loadUser` are in flight at any moment, and the result has 12 users in the order of `ids`

#### Scenario: An object of starters
- **WHEN** `all(ctx, { a, b, c }, { concurrency: 1 })` runs
- **THEN** `a`, `b` and `c` run one after another in that order, and the result is `{ a, b, c }` values

#### Scenario: No option
- **WHEN** `all(ctx, effects)` runs with no third argument
- **THEN** every starter starts at once, as before this change

### Requirement: A failure or an abort starts no waiting starter
When a starter of `all` fails, the running starters SHALL be cancelled and the starters that have not started SHALL NOT be called. When `ctx` aborts, the same SHALL hold for `all` and `allSettled`. A starter that has not started SHALL NOT make a child task and SHALL NOT appear in the trace. `allSettled` SHALL NOT stop on a failure: it SHALL start the next starter when a running one settles, whether it succeeded or failed.

#### Scenario: all fails
- **WHEN** with `{ concurrency: 2 }` the first of five starters rejects while the second runs
- **THEN** the second is aborted, the other three are never called, and `all` rejects with the first error

#### Scenario: allSettled goes on
- **WHEN** with `{ concurrency: 2 }` the first of five starters rejects
- **THEN** the other four run, and the result has one `rejected` entry and four `fulfilled`

#### Scenario: The caller aborts
- **WHEN** `ctx` aborts while two starters run and three wait
- **THEN** the running ones are aborted, the waiting ones are never called, and the group rejects with the abort reason

### Requirement: An invalid concurrency is refused before anything starts
`concurrency` that is `0`, negative, `NaN` or not an integer (except `Infinity`) SHALL throw a `RangeError` before any starter is called or any task is made. `null` or `undefined` for `options` or for `concurrency` SHALL mean no limit.

#### Scenario: Zero
- **WHEN** `all(ctx, [starter], { concurrency: 0 })` is called
- **THEN** it throws a `RangeError`, `starter` is not called, and no trace event is made

#### Scenario: Infinity and null
- **WHEN** `all(ctx, effects, { concurrency: Infinity })` or `all(ctx, effects, null)` is called
- **THEN** every starter starts at once

### Requirement: A limited group is traced like an unlimited one
The group SHALL report `start` once, when the call is made, and `done`, `error` or `cancel` once at its end. Each starter SHALL appear as a `run` child of the group at the time it starts, with the same phases, parents and `rootId` as a starter of an unlimited group. With a limit at least as large as the number of starters, the trace SHALL be the same as without the option.

#### Scenario: One at a time
- **WHEN** three starters run with `{ concurrency: 1 }` on a bus with a tracer
- **THEN** there is one group `start`, and the `run` of the second starter starts after the `run` of the first is done

#### Scenario: A large limit
- **WHEN** the same call runs with `{ concurrency: 10 }` and without the option
- **THEN** the two traces have the same events, apart from their ids
