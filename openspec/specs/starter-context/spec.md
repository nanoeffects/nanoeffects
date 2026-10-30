# starter-context Specification

## Purpose
Say what a starter of `race`, `all`, `allSettled` and `timeout` receives, so it can call any effect on its own context without mixing it with the context of the caller.

## Requirements

### Requirement: A starter receives the context of its own child task
When the first argument of `race`, `all`, `allSettled` or `timeout` is a task context, each starter SHALL be called with the context of a child task made for that starter. The child SHALL have `signal`, `abort`, `emit`, `on`, `off`, `run` and the fields of the bus. Its `signal` SHALL abort when the caller aborts, when the group cancels the starter, and when `abort` of the child is called. A starter that reads only `signal` and `abort` SHALL behave as before.

#### Scenario: take on the child
- **WHEN** `race(ctx, { cancelled: (child) => take(child, "cancel"), waited: (child) => delay(child, 1000) })` runs and `cancel` is emitted
- **THEN** the result has `cancelled`, the delay is aborted, and no listener of `cancel` is left

#### Scenario: The loser stops its own effect only
- **WHEN** the same race ends because the delay finished
- **THEN** the `take` of the other starter is aborted through the child, and the caller's `ctx` is not aborted

#### Scenario: Old starters keep working
- **WHEN** a starter is `({ signal }) => fetchUser(id, { signal })`
- **THEN** it gets the signal of its child, and cancels as before

### Requirement: Outside a task a starter gets a signal and an abort
When the first argument is `{}` or any object that is not a task context, a starter SHALL receive an object with `signal` and `abort`. The types SHALL say so, so `take(child, …)` is a type error there.

#### Scenario: Bare signal
- **WHEN** `all({ signal }, { a: (child) => delay(child, 10) })` runs
- **THEN** the starter gets `signal` and `abort`, and `delay` works

### Requirement: Bound effects reach the child
The effects that `effectsPlugin` puts on a task context SHALL be on the child context of a starter, bound to the child, not to the caller. The fields of a scope that the caller has SHALL be on the child as well. Plugins SHALL give the same result in any order.

#### Scenario: Destructured effects
- **WHEN** the bus has `effectsPlugin({ race, delay, take })` and a handler runs `race({ waited: ({ delay }) => delay(1000), cancelled: ({ take }) => take(cancel) })`
- **THEN** the result is the same as with `(child) => delay(child, 1000)` and `(child) => take(child, cancel)`

#### Scenario: Effects of a scope are bound to the child
- **WHEN** a command has `$effects: { watch }` and a starter calls `child.watch()`
- **THEN** `watch` receives the child as its context, and it is aborted when the race cancels the starter

#### Scenario: Cancelling the race cancels the bound call
- **WHEN** one starter finishes first
- **THEN** the `delay` or `take` that another starter bound to its child is aborted, and the caller's own bound effects are not

### Requirement: The trace shows the child
The child of a starter SHALL be a `run` task under the group of the effect, as before. Listeners and events made through the child SHALL have that `run` task as their parent in the trace.

#### Scenario: Parent of a listener
- **WHEN** a starter calls `take(child, "ev")` on a bus with a tracer
- **THEN** the trace of that wait has the `run` task of the starter as its parent

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
