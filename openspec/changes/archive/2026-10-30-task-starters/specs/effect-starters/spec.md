## ADDED Requirements

### Requirement: The Task of retry, timeout and poll is a starter
The Task returned by `retry(task, options)`, `timeout(ms, task)` and `poll(ms, task, options)` SHALL, when it is called with one argument that is a context, behave as the `ctx` form of the same effect with that context, and SHALL call the wrapped function as `task(undefined, context)`. The group SHALL cancel it like any other starter: when the group cancels the starter, the effect stops, and `retry` starts no further attempt, `timeout` aborts its function and `poll` stops its timer.

#### Scenario: A retry in a race
- **WHEN** `race(ctx, { user: retry(loadUser, { times: 3 }), waited: delay(5000) })` runs and `loadUser` fails twice and then succeeds
- **THEN** the result has `user`, `loadUser` was called 3 times, and the delay is aborted

#### Scenario: The loser stops
- **WHEN** the same race ends because the delay finished while `loadUser` waits for an attempt
- **THEN** the signal of the context that `loadUser` received is aborted and no further attempt starts

#### Scenario: A timeout as a starter
- **WHEN** `all(ctx, { page: timeout(1000, loadPage) })` runs and `loadPage` does not finish in time
- **THEN** the result rejects with a `TimeoutError` and the signal of the context `loadPage` received is aborted

#### Scenario: A poll as a starter
- **WHEN** `race(ctx, { watching: poll(100, refresh), left: take("leave") })` runs and `leave` is emitted after 250 ms
- **THEN** `refresh` has been called twice and no timer is left

### Requirement: The Task call with a payload and a context is unchanged
A Task of `retry`, `timeout` or `poll` called with two arguments, a payload and a context, SHALL behave exactly as before this change, whatever the payload is, including a payload that is itself a context.

#### Scenario: A Task is a handler
- **WHEN** `bus.on("typed", retry(search, { times: 3 }))` is subscribed and `typed` is emitted with an object that has a `signal`
- **THEN** `search` receives that object as its payload and the context of the task as its second argument

#### Scenario: A policy and ctx.run
- **WHEN** `latest(retry(task))` is subscribed, or `ctx.run(retry(task), payload)` is called
- **THEN** the result is the same as before this change

### Requirement: A call with one argument that is not a context fails clearly
A Task of `retry`, `timeout` or `poll` called with one argument that is not a context SHALL throw a `TypeError` whose message says that a Task needs a payload and a context, or a context alone when it is a starter. It SHALL start no timer, make no call of the wrapped function and leave no listener.

#### Scenario: A forgotten context
- **WHEN** `retry(task)("payload")` is called by hand
- **THEN** it throws a `TypeError` and `task` has not been called

### Requirement: The starter form is traced like the ctx form
A Task used as a starter SHALL give the same trace as `(child) => retry(child, fn, options)`, `(child) => timeout(child, ms, fn)` and `(child) => poll(child, fn, ms, options)` in the same place, with the same phases, parents, `rootId` and `traceGroupId`.

#### Scenario: Same trace
- **WHEN** one `race` uses `retry(task)` and another uses the wrapper that forwards the child, on a bus with a tracer
- **THEN** the two traces have the same events, apart from their ids

### Requirement: The starter form is typed only when the payload can be absent
The type of a Task of `retry`, `timeout` or `poll` SHALL be accepted as a starter of a group only when the wrapped function accepts `undefined` as its payload. It SHALL stay accepted as a Task for every payload type, and the inference of handlers, policies and `ctx.run` SHALL NOT change.

#### Scenario: A task that needs a payload
- **WHEN** `race(ctx, { user: retry(loadUser) })` is written and `loadUser` takes a `string` payload
- **THEN** the type checker reports an error

#### Scenario: A task without a payload
- **WHEN** `race(ctx, { user: retry((_, { signal }) => fetchUser(id, { signal })) })` is written
- **THEN** it type-checks, and the type of `result.user` is the awaited result of the function
