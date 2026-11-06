# policy-rate-limit Specification

## Purpose
Keeps a handler under a quota, such as "10 requests per second" of an API, by letting only a set number of runs start in any period and delaying the rest. It limits starts, not how many runs go at the same time.

## Requirements

### Requirement: At most `limit` runs start in any window of `ms`
`rateLimit(limit, ms, fn, options?)` SHALL start `fn` at once while fewer than `limit` runs started in the last `ms` milliseconds, counted back from the moment of the call (a sliding window). A call over that limit SHALL wait, and SHALL start when the oldest start leaves the window. Waiting calls SHALL start in the order they arrived. Every call SHALL return a promise with the result of its own run.

#### Scenario: Under the limit
- **WHEN** `rateLimit(2, 1000, fn)` is called twice at the same moment
- **THEN** `fn` starts for both at once

#### Scenario: Over the limit
- **WHEN** it is called three times at the same moment
- **THEN** `fn` starts twice at once, and for the third call 1000 ms after the first start

#### Scenario: A sliding window
- **WHEN** `rateLimit(2, 1000, fn)` starts a run at 0 ms and another at 600 ms, and a third call arrives at 700 ms
- **THEN** the third run starts at 1000 ms, when the first start leaves the window, not at 1600 ms

#### Scenario: Order
- **WHEN** three calls wait for the window
- **THEN** their runs start in the order of the calls

### Requirement: A call over the limit can be dropped instead
With `options.overflow` set to `"drop"`, a call that arrives when `limit` runs already started in the window SHALL not wait: it SHALL not run `fn` and SHALL resolve with `undefined`. The default, `"wait"`, SHALL keep the call until it can start. There SHALL be no cap on waiting calls.

#### Scenario: Drop
- **WHEN** `rateLimit(1, 1000, fn, { overflow: "drop" })` is called twice at the same moment
- **THEN** `fn` runs once and the second call resolves with `undefined`

### Requirement: Aborting removes a waiting call
A call whose task aborts while it waits SHALL leave the line and resolve with `undefined`, and SHALL not use a place in the window. A call whose task is aborted already SHALL do nothing. A run that has started SHALL not be counted as ended by an abort: the window counts starts.

#### Scenario: Abort while waiting
- **WHEN** the second call is waiting and its task aborts
- **THEN** it resolves with `undefined`, `fn` never runs for it, and a third call waiting behind it starts when its own turn comes

#### Scenario: Abort after the start
- **WHEN** a run has started and its task aborts
- **THEN** its result is dropped, its promise resolves with `undefined`, and its start still counts in the window

### Requirement: Runs are independent of each other
`rateLimit` SHALL not limit how many runs go at the same time and SHALL not wait for a run to settle. An error of one run SHALL reject only its own call and SHALL not change what the window allows.

#### Scenario: Slow runs
- **WHEN** `rateLimit(2, 1000, fn)` starts two runs that last 5000 ms and a third call arrives at 1500 ms
- **THEN** the third run starts at 1500 ms, while the first two still go

### Requirement: The window of a key is dropped when it empties
With `options.key` each key SHALL have its own window and its own line. When no start is left in the window and no call waits, the state of that key SHALL be dropped, so keys can be unbounded. Waiting SHALL use one timer per key and `setTimer` / `clearTimer`.

#### Scenario: Two keys
- **WHEN** `rateLimit(1, 1000, fn, { key: (userId) => userId })` is called for two users at the same moment
- **THEN** `fn` starts for both at once

#### Scenario: Idle key
- **WHEN** the window of a key has emptied
- **THEN** no timer is left for it

### Requirement: Odd arguments are made safe
A `limit` below 1 or `NaN` SHALL be treated as 1. `ms` SHALL follow `setTimer`: negative or `NaN` is 0, which limits nothing, and `Infinity` makes the window never close.

#### Scenario: Zero limit
- **WHEN** `rateLimit(0, 1000, fn)` is used
- **THEN** it behaves as `rateLimit(1, 1000, fn)`

### Requirement: Rate limit reports its calls to a job
A call SHALL be reported to a job as starting when its `fn` is called, not at the call, so a waiting call sends no `pending` yet. A dropped call and a waiting call that is aborted SHALL be reported as ended without starting. A started call SHALL report its outcome when it settles.

#### Scenario: A waiting job call
- **WHEN** a job handler is `rateLimit(1, 1000, fn)` and the job is emitted twice at once
- **THEN** the first emit sends `pending` at once and the second sends it 1000 ms later

### Requirement: Rate limit takes the same forms as the other policies
`rateLimit` SHALL be callable as `rateLimit(limit, ms, fn, options?)`, `rateLimit(limit, ms, options)(fn)` and with a `key` that tells the payload type, SHALL work through `withPolicy` and `usePolicy`, and a `null` option SHALL fall back to its default.

#### Scenario: Curried form
- **WHEN** `rateLimit(5, 1000)(fn)` is called
- **THEN** it behaves as `rateLimit(5, 1000, fn)`
