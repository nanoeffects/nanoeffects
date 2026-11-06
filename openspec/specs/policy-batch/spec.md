# policy-batch Specification

## Purpose
Turns many small calls that arrive close together into one call of a handler with all their payloads, for work that is cheaper in bulk: analytics events, log lines, "get these ids" requests. All callers get the result of that one run.

## Requirements

### Requirement: Payloads of one window go to the handler once
`batch(ms, fn, options?)` SHALL collect the payloads of calls in a window of `ms` milliseconds that opens at the first call of an empty batch, and when the window closes SHALL call `fn` once with an array of those payloads in the order of the calls. The window SHALL NOT move when more calls arrive (it is not a debounce). A call that arrives after the window closed SHALL open the next window.

#### Scenario: Three calls in a window
- **WHEN** `batch(100, send)` is called with `1` at 0 ms, `2` at 40 ms and `3` at 90 ms
- **THEN** `send` is called once at 100 ms with `[1, 2, 3]`

#### Scenario: A fixed window
- **WHEN** calls keep arriving every 60 ms
- **THEN** `fn` runs at 100 ms, 200 ms and so on, not only after the calls stop

#### Scenario: One call
- **WHEN** a single call with `5` arrives
- **THEN** `fn` is called with `[5]` after `ms`

### Requirement: A full batch is sent at once
With `options.maxSize` the batch SHALL be sent as soon as it holds that many payloads, without waiting for the window, and its timer SHALL be cleared. The next call SHALL open a new window. A `maxSize` below 1 or `NaN` SHALL be treated as 1. Without `maxSize` the size is not limited.

#### Scenario: Reaching the size
- **WHEN** `batch(1000, send, { maxSize: 2 })` is called with `1` and `2`
- **THEN** `send` is called at once with `[1, 2]`

### Requirement: Every caller gets the result of the one run
The promise of every call in a batch SHALL resolve with the value that `fn` returned for that batch, the same value for all, and SHALL reject with its error when `fn` rejects or throws. Splitting the result per caller is not done by `batch`.

#### Scenario: A shared value
- **WHEN** three calls are in one batch and `fn` returns `"ok"`
- **THEN** all three promises resolve with `"ok"`

#### Scenario: A shared error
- **WHEN** `fn` rejects for a batch of three calls
- **THEN** all three promises reject with that error

### Requirement: Aborting a caller
A call whose task aborts while its payload still waits for the window SHALL be taken out of the batch and resolve with `undefined`; if the batch is then empty its timer SHALL be cleared and nothing SHALL run. A call whose task aborts after the batch was sent SHALL resolve with `undefined` and SHALL NOT change the run, unless it is the call whose context the run got (see the next requirement). A call whose task is aborted already SHALL do nothing.

#### Scenario: Abort while collecting
- **WHEN** a call is aborted before the window closes
- **THEN** `fn` is called without its payload, and its promise resolves with `undefined`

#### Scenario: The only call aborts
- **WHEN** the only call of a window aborts
- **THEN** `fn` never runs and no timer is left

#### Scenario: Abort after the send
- **WHEN** a call aborts while `fn` runs for its batch
- **THEN** its promise resolves with `undefined` and the other callers still get the result

### Requirement: The run belongs to one task
`fn` SHALL get the context of the first caller of the batch that is still live when the batch is sent. When that task aborts while `fn` runs, the run SHALL be aborted and every caller that has not aborted SHALL resolve with `undefined`. The run SHALL NOT be started again, because a bulk call may have partly happened.

#### Scenario: The owner aborts during the run
- **WHEN** the task whose context `fn` got aborts while `fn` runs
- **THEN** the signal of `fn` is aborted, and every caller of that batch resolves with `undefined`

#### Scenario: The first caller left earlier
- **WHEN** the first caller aborted while the batch was collecting
- **THEN** `fn` gets the context of the next live caller

### Requirement: Each key batches on its own
With `options.key` payloads SHALL be grouped per key: each key has its own window, its own `maxSize` and its own run. The state of a key SHALL be dropped when its batch has been sent and settled, so keys can be unbounded.

#### Scenario: Two keys
- **WHEN** `batch(100, send, { key: (event) => event.userId })` gets events of two users in one window
- **THEN** `send` is called twice, once per user, each with that user's events

### Requirement: Batch reports its calls to a job
The caller whose context `fn` got SHALL be reported as starting when `fn` is called and with the outcome when it settles. Every other call of the batch SHALL be reported as ended without starting, so one batch gives a job one `pending` and one closing outcome. A call aborted while collecting SHALL be reported as ended without starting.

#### Scenario: A job with three calls
- **WHEN** a job handler is `batch(100, fn)` and the job is emitted three times in one window
- **THEN** the job sends one `pending` at 100 ms and one `success`

### Requirement: Batch takes the same forms as the other policies
`batch` SHALL be callable as `batch(ms, fn, options?)`, `batch(ms, options)(fn)` and with a `key` that tells the payload type, SHALL return a promise for every call, SHALL use `setTimer` / `clearTimer`, SHALL work through `withPolicy` and `usePolicy` (the function takes one payload; `fn` gets the array), and a `null` option SHALL fall back to its default.

#### Scenario: Plain function
- **WHEN** `withPolicy(batch(100, send))` is called twice within 100 ms
- **THEN** `send` is called once with both payloads
