# curried-policies Specification

## Purpose
Lets a library policy be called without its function and return a wrapper `(task) => policy`, so code that builds the function itself (such as `usePolicy`) takes `debounce(300)` and the user has no `task` to swap for their own callback.

## Requirements

### Requirement: A policy called without a task returns a wrapper
`latest`, `leading`, `debounce`, `throttle` and `queue` SHALL accept a call that has no task. The call keeps its other arguments (`ms` for `debounce` and `throttle`, `options` for all) and returns a function `(task) => policy` that gives the same result as the call with the task: `debounce(ms, options)(task)` SHALL behave as `debounce(ms, task, options)`, and `latest(options)(task)` as `latest(task, options)`. The wrapper SHALL make a new policy, with its own state, each time it is called.

#### Scenario: A wrapper debounces like the direct call
- **WHEN** `const wrap = debounce(100)` is made, `const task = wrap(callback)`, and `task` is called twice within 100 ms
- **THEN** `callback` runs once, with the last payload, 100 ms after the last call

#### Scenario: Options go with the wrapper
- **WHEN** `queue({ key: (job) => job.id })` is made and applied to a callback
- **THEN** the calls with one `id` run one after another and the calls with different `id` do not wait for each other

#### Scenario: Each application is a new policy
- **WHEN** one wrapper `latest()` is applied to two callbacks
- **THEN** a new call of the first does not abort a run of the second

### Requirement: The call with a task is unchanged
`debounce(ms, task, options?)`, `throttle(ms, task, options?)`, `latest(task, options?)`, `leading(task, options?)` and `queue(task, options?)` SHALL keep their arguments, results and lifecycle reports. Whether the call is the wrapper form or the direct one SHALL be decided by the type of the argument that holds the task: a function is the task, anything else (an object or nothing) is `options`.

#### Scenario: Direct call
- **WHEN** `latest(callback, { key })` is called
- **THEN** it returns a task, not a wrapper

#### Scenario: No arguments
- **WHEN** `latest()` is called
- **THEN** it returns a wrapper

### Requirement: Wrappers report to jobs like policies
A task made by a wrapper SHALL carry the same mark that makes `createJob` read the start, drop, cancel and done of each call as for the direct call.

#### Scenario: A job with a wrapper
- **WHEN** a job handler is made as `debounce(100)(callback)` and called twice within 100 ms
- **THEN** the first call ends with `cancel` or `drop` as for `debounce(100, callback)`, and `pending` has one closing outcome

### Requirement: The types keep the payload and the result
The type of a wrapper SHALL be generic in the payload, the event map and the result of the task it gets, so `debounce(100)(callback)` has the payload type of `callback` and the result type of the direct call. A `key` option in the wrapper form SHALL type its payload from the annotation of the parameter of `key`.

#### Scenario: Inference
- **WHEN** `usePolicy((text: string) => save(text), debounce(100))` is written
- **THEN** the returned function takes a `string`

#### Scenario: A policy where a task is expected
- **WHEN** a result of the direct call `debounce(100, callback)` is passed to `usePolicy` as `make`
- **THEN** the type checker rejects it
