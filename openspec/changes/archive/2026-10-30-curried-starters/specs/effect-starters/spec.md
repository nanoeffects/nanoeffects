## ADDED Requirements

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
