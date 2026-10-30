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
