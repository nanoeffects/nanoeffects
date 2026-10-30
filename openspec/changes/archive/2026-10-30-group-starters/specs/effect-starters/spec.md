## ADDED Requirements

### Requirement: A group without a context is a starter
`all(effects)`, `allSettled(effects)` and `race(effects)`, called with one argument that is an array of starters or an object of starters, SHALL return a starter: a function that takes the context of its child task and returns the promise of the same group run with that context. It SHALL start nothing until it is called. The result of the group SHALL be the same as that of the `ctx` form: the same shape, values, errors and cancellation. The `ctx` forms SHALL behave as before.

#### Scenario: A group in a race
- **WHEN** `race(ctx, { loaded: all({ user: retry(loadUser), posts: retry(loadPosts) }), waited: delay(5000) })` runs and both loads finish before 5000 ms
- **THEN** the result has `loaded` with `user` and `posts`, and the delay is aborted

#### Scenario: Arrays and allSettled
- **WHEN** `all(ctx, [allSettled([retry(loadUser)]), delay(10)])` runs
- **THEN** the first value is an array with one `{ status, value }` entry, as `allSettled(child, [...])` gives

#### Scenario: Nothing runs before the group calls it
- **WHEN** `all({ a: delay(10) })` is created and not called
- **THEN** no timer is pending and no starter was called

#### Scenario: The ctx form is unchanged
- **WHEN** `await all(ctx, { a: ({ signal }) => load({ signal }) })` is called in a handler
- **THEN** it behaves exactly as before this change

### Requirement: The inner group is cancelled with the outer group
When the outer group cancels a starter made by `all`, `allSettled` or `race` without `ctx`, the inner group SHALL be cancelled, and the inner group SHALL cancel its own starters, as the `ctx` form does for its child.

#### Scenario: The outer race is won by another starter
- **WHEN** `race(ctx, { loaded: all({ user: retry(loadUser) }), waited: delay(10) })` runs and the delay finishes first while `loadUser` waits
- **THEN** the signal of the context `loadUser` received is aborted and no further attempt starts

#### Scenario: One inner failure
- **WHEN** a starter of an inner `all` fails
- **THEN** the other starters of that inner group are cancelled, and the outer group sees the failure of the inner one

### Requirement: The form is told by the number of arguments
`all`, `allSettled` and `race` SHALL take one argument as the short form and two as the `ctx` form. A single argument that is a context, an object whose `signal` is an abort signal, SHALL throw a `TypeError` that says the effects are missing, and SHALL start nothing. An effects object with a key named `signal` is still effects: its value is a starter, a function, and not an abort signal.

#### Scenario: A forgotten effects argument
- **WHEN** `all(ctx)` is called with a task context and no effects
- **THEN** it throws a `TypeError` and starts no timer or starter

#### Scenario: A starter named signal
- **WHEN** `all({ signal: (child) => load(child.signal) })` is written
- **THEN** it is the short form and returns a starter

#### Scenario: An empty object as a context
- **WHEN** `all({}, { a: delay(10) })` is called
- **THEN** it is the `ctx` form and returns a promise, as before

### Requirement: A group starter is traced like the wrapped call
A starter made by `all`, `allSettled` or `race` SHALL give the same trace as `(child) => all(child, effects)`, `(child) => allSettled(child, effects)` and `(child) => race(child, effects)` in the same place, with the same phases, parents, `rootId` and `traceGroupId`.

#### Scenario: Same trace
- **WHEN** one `race` nests `all({ … })` and another nests the wrapper that forwards the child, on a bus with a tracer
- **THEN** the two traces have the same events, apart from their ids

### Requirement: A group starter can be reused and is typed from the outer group
A starter made by a group without `ctx` SHALL keep no state between calls, so it can serve two outer groups. Its type SHALL be accepted as a starter of a group, and the type of its value SHALL be the type of the result of the same group with a context.

#### Scenario: Result type
- **WHEN** `race(ctx, { loaded: all({ user: retry(loadUser) }) })` is written and `loadUser` returns a `User`
- **THEN** the type of `result.loaded` is `{ user: User } | undefined`

#### Scenario: A wrong value
- **WHEN** `all({ a: 1 })` is written
- **THEN** the type checker reports an error
