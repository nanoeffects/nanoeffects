# effect-starters Specification

## Purpose
Let `delay` and `take` be written without `ctx` and the forwarding wrapper, so a group (`race`, `all`, `allSettled`, `timeout`) can take them as ready-made starters: `race(ctx, { waited: delay(1000), cancelled: take(cancel) })`.

## Requirements

### Requirement: delay without a context is a starter
`delay(ms)`, where `ms` is a number or a function that returns the number of milliseconds, SHALL return a starter: a function that takes the context of its child task and returns a promise that resolves after `ms`, or rejects with the abort reason when that context aborts. It SHALL start no timer until it is called. `delay(ctx, ms)` SHALL behave as before.

#### Scenario: A starter in a race
- **WHEN** `race(ctx, { waited: delay(1000), cancelled: take(cancel) })` runs and nothing is emitted for 1000 ms
- **THEN** the result has `waited` and the wait for `cancel` is aborted, with no listener left

#### Scenario: Nothing runs before the group calls it
- **WHEN** `delay(1000)` is created and not called
- **THEN** no timer is pending

#### Scenario: A function of ms is read when the delay starts
- **WHEN** `delay(() => 200 + Math.random() * 200)` is called by a group
- **THEN** the function is called once, when that call starts

#### Scenario: The ctx form is unchanged
- **WHEN** `await delay(ctx, 500)` is called in a handler
- **THEN** it behaves exactly as before this change

### Requirement: take without a context is a starter
`take(event, options?)`, where `event` is the name of an event or an action creator, SHALL return a starter that takes the context of its child task and resolves with the next payload of `event`, as `take(child, event, options)` does. It SHALL subscribe only when called. The type of the payload and the narrowing by a type guard in `options.predicate` SHALL be the same as in the `ctx` form. `take(ctx, event, options?)` SHALL behave as before.

#### Scenario: A creator gives the payload type
- **WHEN** `race(ctx, { stopped: take(stopRequested) })` runs and `stopRequested` is a creator of `string` payloads
- **THEN** the type of `result.stopped` is `string | undefined`

#### Scenario: A guard narrows the result
- **WHEN** `take(resultReceived, { predicate: (result): result is { ok: false } => !result.ok })` is a starter of a group and `resultReceived` is a creator of results
- **THEN** the type of its value is `{ ok: false }`

#### Scenario: The loser stops listening
- **WHEN** another starter of the same `race` wins
- **THEN** the starter made by `take` is aborted through its child and unsubscribes

### Requirement: The short form is told from the ctx form by the first argument
`delay` and `take` SHALL choose the form by the first argument alone, without looking at the number of arguments. An object that is not a function SHALL select the `ctx` form, including `{}`. A number, a string or a function SHALL select the short form. No call that is valid today SHALL change its form.

#### Scenario: An empty object is a context
- **WHEN** `delay({}, 10)` is called
- **THEN** it returns a promise, as before

#### Scenario: A creator is not a context
- **WHEN** `take(stopRequested)` is called and `stopRequested` is an action creator, which is a function
- **THEN** it returns a starter

#### Scenario: A wrong call is a type error
- **WHEN** `delay("1000")` is written
- **THEN** the type checker reports an error

### Requirement: A starter can be reused
A starter made by `delay` or `take` SHALL keep no state between calls. Calling it for two groups SHALL start two independent waits.

#### Scenario: One starter, two races
- **WHEN** `const pause = delay(100)` is used as a starter in two `race` calls one after the other
- **THEN** each call waits 100 ms on its own and an abort of the first does not touch the second

### Requirement: A starter is traced like the wrapped call
A starter made by `delay` or `take` SHALL give the same trace as `(child) => delay(child, ms)` or `(child) => take(child, event)` in the same place: its group is a child of the `run` task of the starter in the same `race`, with the same phases, the same parent, `rootId` and `traceGroupId`.

#### Scenario: Same trace
- **WHEN** one `race` uses the wrapped form and another uses `take(event)`, on a bus with a tracer
- **THEN** the two traces have the same events, apart from their ids

### Requirement: Bound effects keep their forms
The `delay` and `take` that `effectsPlugin` puts on a task context SHALL stay bound to that context and SHALL NOT return a starter: `ctx.delay(1000)` waits and resolves, as it does today.

#### Scenario: Destructured delay still waits
- **WHEN** a handler runs `await delay(1000)` with `delay` taken from a context that `effectsPlugin({ delay })` filled
- **THEN** the call resolves after 1000 ms

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
