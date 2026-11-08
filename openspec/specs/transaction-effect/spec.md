# transaction-effect Specification

## Purpose
Run several side effects as one unit: each step has a rollback, and when a later step fails or the task is aborted, the steps that finished are rolled back by a strategy the caller can set, so a flow does not stop halfway.

## Requirements

### Requirement: Steps run in order and give their values
`transaction(ctx, steps)` SHALL run the `run` of each step one after another, each in a child task of `ctx` with its own `signal`, and SHALL resolve with the array of the values the steps returned, in step order. A step starts only after the one before it has finished.

#### Scenario: All steps succeed
- **WHEN** a transaction has three steps whose `run` return `1`, `2` and `3`
- **THEN** the steps run in that order, one at a time, and the result is `[1, 2, 3]`

#### Scenario: No steps
- **WHEN** a transaction has an empty list of steps
- **THEN** it resolves with `[]` and calls nothing

#### Scenario: A step gets a signal of its own
- **WHEN** a step reads `signal` from its context
- **THEN** it is an `AbortSignal` that aborts when the task of the transaction aborts

### Requirement: A failed step rolls back the finished steps
When the `run` of a step throws or rejects, `transaction` SHALL call `rollback` of every step that finished before it, last first, one at a time, and SHALL then reject with the error of the failed step. The failed step SHALL NOT be rolled back and later steps SHALL NOT start. A step with no `rollback` SHALL be skipped.

#### Scenario: The third step fails
- **WHEN** steps A, B and C run and C throws `boom`
- **THEN** `rollback` of B is called, then `rollback` of A, `rollback` of C is not called, and the result rejects with `boom`

#### Scenario: The first step fails
- **WHEN** the first step throws
- **THEN** no `rollback` is called and the result rejects with its error

#### Scenario: A step without rollback
- **WHEN** step B has no `rollback` and step C fails
- **THEN** `rollback` of A is called and nothing is called for B

### Requirement: rollback gets the value of its step and no abort signal
`rollback` SHALL be called with the value that `run` of the same step returned, and SHALL NOT receive a signal that the abort of the task has aborted. A rollback that starts because of an abort SHALL run to its end.

#### Scenario: rollback reads the result of run
- **WHEN** `run` returns `"order-7"` and a later step fails
- **THEN** `rollback` is called with `"order-7"`

#### Scenario: An abort does not cut the rollback
- **WHEN** the task is aborted while the third of three steps runs
- **THEN** `rollback` of the second and the first step are still called, in that order, and run to their end

### Requirement: An abort rolls back and rejects with its reason
When the task is aborted while the transaction runs, `transaction` SHALL start no further step, SHALL roll back the finished steps, including a step whose `run` finishes after the abort, and SHALL reject with the abort reason. It SHALL NOT resolve.

#### Scenario: Abort between steps
- **WHEN** the task is aborted after step A finished and before step B starts
- **THEN** B does not start, `rollback` of A is called, and the result rejects with the abort reason

#### Scenario: A step that ignores the signal finishes after the abort
- **WHEN** the task is aborted while step B runs and the `run` of B ignores its signal and returns a value
- **THEN** B counts as finished: its `rollback` is called with that value, before the `rollback` of A

#### Scenario: Already aborted
- **WHEN** `transaction` is called with a context that is already aborted
- **THEN** no step starts and the result rejects with the abort reason

### Requirement: Strategy options and their precedence
`transaction(ctx, steps, options)` SHALL accept `rollbackOn`, `rollbackFailure` and `rollbackOrder` in `options`, and a step SHALL accept `rollbackOn` and `rollbackFailure`: as fields of the step in the array and positional forms, and as the options argument of `step(run, rollback, options)` in the scope form. A value on a step SHALL win over the same option of `options`, and `options` over the default. The defaults are `rollbackOn: "both"`, `rollbackFailure: "continue"` and `rollbackOrder: "reverse"`. An option that is `null` or missing SHALL fall back to the next level.

#### Scenario: A step overrides the effect
- **WHEN** the options say `rollbackOn: "error"` and one step says `rollbackOn: "both"`, and the task is aborted after both steps finished
- **THEN** only the rollback of the step that said `"both"` is called

#### Scenario: A step of the scope form overrides the effect
- **WHEN** the options say `rollbackOn: "error"` and a call `step(run, rollback, { rollbackOn: "both" })` finished before an abort
- **THEN** its rollback is called

#### Scenario: Defaults
- **WHEN** no strategy option is given anywhere
- **THEN** a rollback is called on an error and on an abort, in reverse order, and a failed rollback does not stop the others

#### Scenario: Null falls back
- **WHEN** `rollbackOn` is `null` on a step and `"abort"` in the options
- **THEN** the step behaves as `"abort"`

#### Scenario: A wrong value is rejected before anything runs
- **WHEN** an option of the transaction, or of a step in the array and positional forms, has a value that is not one of its listed values, or `rollbackFailure` is `"stop"` anywhere while `rollbackOrder` is `"parallel"`
- **THEN** the call throws a `RangeError` for a wrong value and a `TypeError` for the combination, and no step starts

### Requirement: rollbackOn chooses the case in which a rollback is called
A rollback with `rollbackOn: "error"` SHALL be called when a step failed and SHALL NOT be called when the task was aborted. With `"abort"` it SHALL be called when the task was aborted and not when a step failed. With `"both"` it SHALL be called in both. The task counts as aborted when its signal is aborted by the time the forward run ends.

#### Scenario: error only, task aborted
- **WHEN** a transaction with `rollbackOn: "error"` is aborted after step A finished
- **THEN** `rollback` of A is not called and the result rejects with the abort reason

#### Scenario: abort only, step fails
- **WHEN** a transaction with `rollbackOn: "abort"` has step B fail after step A finished
- **THEN** `rollback` of A is not called and the result rejects with the error of B

### Requirement: rollbackFailure chooses whether a failed rollback stops the rest
When a `rollback` throws or rejects, the rollbacks that are left SHALL still be called if the strategy of the failed step is `"continue"`, and SHALL NOT be called if it is `"stop"`. The result SHALL reject with an `AggregateError` whose `errors` are the original error (the failed step's error or the abort reason) first, then the errors of the rollbacks in the order they happened. Without a failed rollback it SHALL reject with the original error itself.

#### Scenario: continue after a failed rollback
- **WHEN** steps A, B, C run, C throws `boom`, and `rollback` of B throws `oops`, with the default strategy
- **THEN** `rollback` of A is still called and the result rejects with an `AggregateError` whose `errors` are `[boom, oops]`

#### Scenario: stop after a failed rollback
- **WHEN** the same happens and step B has `rollbackFailure: "stop"`
- **THEN** `rollback` of A is not called and the result rejects with an `AggregateError` whose `errors` are `[boom, oops]`

#### Scenario: A failed rollback after an abort
- **WHEN** the task is aborted and a `rollback` throws
- **THEN** the `AggregateError` has the abort reason first and the error of the rollback after it

### Requirement: rollbackOrder chooses reverse or parallel
With `rollbackOrder: "reverse"` the rollbacks SHALL be called one at a time, last step first, each after the one before has settled. With `"parallel"` they SHALL all be called at once and the result SHALL wait for all of them to settle. The order SHALL be set in `options` only.

#### Scenario: parallel rollback
- **WHEN** three steps finished, a later step fails, and the options say `rollbackOrder: "parallel"`
- **THEN** the three rollbacks are called without waiting for one another, and the result settles after all of them have settled

#### Scenario: A failure in parallel mode is collected
- **WHEN** one of the parallel rollbacks throws and the others succeed
- **THEN** all of them have been called and the result rejects with an `AggregateError` holding the original error and that error

### Requirement: The result settles after the rollback
`transaction` SHALL settle its result only after the last rollback it is going to call has finished. A result that rejects SHALL NOT reject while a rollback is still running.

#### Scenario: A slow rollback
- **WHEN** a transaction fails and `rollback` of the first step takes 100 ms
- **THEN** the result is pending until that `rollback` finishes, then rejects with the error of the failed step

#### Scenario: A queue handler frees its slot after the rollback
- **WHEN** a `queue` handler runs a transaction that fails and a second call waits in the queue
- **THEN** the second call starts after the last `rollback` of the first has finished

### Requirement: A rollback can be wrapped by the caller
`rollback` SHALL be an ordinary callback of the value, so that the caller can wrap it in any function, including `retry` called with `{}` as its context. The transaction SHALL wait for the promise the callback returns, and SHALL treat its rejection as a failed rollback.

#### Scenario: A retried rollback
- **WHEN** `rollback` is `(value) => retry({}, () => cancel(value), { times: 3 })` and `cancel` fails twice and then succeeds
- **THEN** the transaction counts the rollback as done and the result rejects only with the original error

#### Scenario: A retried rollback that keeps failing
- **WHEN** the same `cancel` fails on every attempt
- **THEN** the result rejects with an `AggregateError` that holds the original error and the last error of `cancel`

### Requirement: Two call forms
The steps SHALL be given as arguments, as an array, or by a function that calls `step`, in a form with a context and in a starter form for a group (`all`, `race`, `allSettled`), and every form SHALL take the same options and behave the same. With steps as arguments the options come first, and `null` means none: `transaction(ctx, options?, ...steps)` and `transaction(options?, ...steps)`; with an array they come last: `transaction(ctx, steps, options?)` and `transaction(steps, options?)`; with a function they come last as well: `transaction(ctx, body, options?)` and `transaction(body, options?)`.

#### Scenario: A transaction inside a group
- **WHEN** `all(ctx, { order: transaction(steps), user: loadUser })` runs and `loadUser` fails
- **THEN** the group aborts the transaction and the finished steps of it are rolled back

#### Scenario: A scope body inside a group
- **WHEN** `all(ctx, { order: transaction(body), user: loadUser })` runs, `body` has finished steps, and `loadUser` fails
- **THEN** the group aborts the transaction and the finished steps of the body are rolled back

#### Scenario: A starter with options
- **WHEN** `all(ctx, { order: transaction(steps, { rollbackOrder: "parallel" }), user: loadUser })` runs and `loadUser` fails after the steps finished
- **THEN** the rollbacks of the steps are called at once, as in the `ctx` form with the same options

#### Scenario: The first argument tells the form
- **WHEN** the first argument is a function, the call is the starter with a body; when it is an array, the call is the starter with an array; when it is an object with a `run` function (and no object `signal`), it is the first step of a starter; when it is an object and the second argument is a function, the object is the context and the function the body (`{}` is valid as a context here); when it is an object whose `signal` is an object, it is a context; any other object, `{}` included, or `null`, is the options of a starter (`{}` as a context is valid in the array form only)
- **THEN** the call has the form that rule gives, and a call with no step, or with a value that is not a step, throws a `TypeError`

#### Scenario: Steps as arguments give the same result as an array
- **WHEN** `transaction(ctx, first, second)` and `transaction(ctx, [first, second])` run the same steps
- **THEN** both resolve with the same values and call the same rollbacks

#### Scenario: A rollback is typed from its run
- **WHEN** a step written as an argument, or a call of `step`, has `run` returning a string and `rollback: (value) => ...`
- **THEN** `value` is a string for the checker; in the array form `value` is `any`

#### Scenario: The scope form types the data
- **WHEN** a body takes the value of `step(() => createOrder())` and passes `order.id` to the next step
- **THEN** `order` has the type that `createOrder` returns for the checker, and a `rollback` whose parameter type does not match that value, or an option value that is not a word of the option, is a compile error

#### Scenario: A lone context is a mistake
- **WHEN** `transaction(ctx)` is called with a context and no steps
- **THEN** it throws a `TypeError`, as `all` does

### Requirement: The effect can be bound to the context
`effectsPlugin({ transaction })` SHALL give every task a `ctx.transaction` bound to that task, with the same results and errors as `transaction(ctx, ...)` for each form: `ctx.transaction(steps, options)`, `ctx.transaction(options, ...steps)`, `ctx.transaction(...steps)` and `ctx.transaction(body, options)`.

#### Scenario: Bound call
- **WHEN** the bus uses `effectsPlugin({ transaction })` and a handler calls `ctx.transaction(steps, { rollbackOrder: "parallel" })`
- **THEN** the steps run in a child of that task and the result is the array of their values

#### Scenario: Bound scope form
- **WHEN** a handler calls `ctx.transaction(async (step) => { ... })`
- **THEN** the steps run in a child of that task and the result is what the body returns

### Requirement: Tracing shows the group and the steps
On a bus with a tracer, `transaction` SHALL be traced as a group named `transaction` with each `run` of a step as a `run` child. The group SHALL end with `done` when every step finished, with `error` and the error when a step failed, and with `cancel` when the task was aborted.

#### Scenario: A failed transaction
- **WHEN** a traced transaction has steps A and B and B fails
- **THEN** the trace has a `transaction` group with two `run` children, the run of B ends with `error`, and the group ends with `error`

#### Scenario: An aborted transaction
- **WHEN** the task is aborted while a step runs
- **THEN** the group ends with `cancel`

### Requirement: Nothing is left behind
After `transaction` settles, no timer, no abort listener and no child task SHALL stay held by it, for success, failure, abort and a failed rollback, in every strategy.

#### Scenario: Listeners are released
- **WHEN** a transaction succeeds, fails, is aborted and has a failed rollback, each in its own run
- **THEN** the signal of the parent has no listener left from the transaction after each one settled

### Requirement: A transaction can be written as a function that calls step
`transaction(ctx, body, options?)` SHALL call `body(step)` and SHALL resolve with the value `body` returns (the promise it returns, awaited). `step(run, rollback?, stepOptions?)` SHALL run `run` as a step of the transaction, in a child task with its own `signal`, and SHALL return a promise of the value `run` returned. A step SHALL start when `step` is called; the order of the steps is the order of the calls the body makes. If `body` returns, nothing SHALL be rolled back.

#### Scenario: Data goes through variables
- **WHEN** the body awaits `step(createOrder)`, then calls `step(() => charge(order.id))` with the value of the first
- **THEN** the second step sees the value of the first, and the transaction resolves with what the body returns

#### Scenario: The body returns
- **WHEN** the body awaits two steps that finish and returns `"done"`
- **THEN** the transaction resolves with `"done"` and no `rollback` is called

#### Scenario: A step gets a signal of its own
- **WHEN** `run` of a step reads `signal` from its context
- **THEN** it is an `AbortSignal` that aborts when the task of the transaction aborts

#### Scenario: The body is not a step list
- **WHEN** the transaction is the scope form
- **THEN** the result is the return value of the body, not an array of the values of the steps

### Requirement: The scope form rolls back like the other forms
When `body` throws or rejects, or the task is aborted, the scope form SHALL call `rollback` of every step that finished, by the same strategy as the array form (`rollbackOn`, `rollbackFailure`, `rollbackOrder`; reverse, one at a time, by default). The failed step SHALL NOT be rolled back. `rollback` SHALL get the value of its own step and no signal. The error of a step the body catches SHALL NOT start a rollback.

#### Scenario: A later step fails
- **WHEN** the body awaits steps A and B and step C throws `boom`
- **THEN** `rollback` of B is called, then `rollback` of A, `rollback` of C is not called, and the result rejects with `boom`

#### Scenario: The body throws after its steps
- **WHEN** the body awaits steps A and B and then throws `late`
- **THEN** `rollback` of B and then of A are called and the result rejects with `late`

#### Scenario: A step the body catches
- **WHEN** the body catches the error of step C and returns normally
- **THEN** nothing is rolled back and the transaction resolves

#### Scenario: Abort
- **WHEN** the task is aborted while the second of two steps runs
- **THEN** the finished first step is rolled back, an unfinished second step that ignored its signal and then returned is rolled back too, and the result rejects with the abort reason after the rollbacks

#### Scenario: A failed rollback
- **WHEN** a step fails and a rollback of an earlier step fails as well
- **THEN** the result rejects with an `AggregateError` whose first error is the one of the step

#### Scenario: Both forms give the same calls
- **WHEN** the same steps, options and failure are written as an array and as a scope body
- **THEN** the same rollbacks are called in the same order and the result rejects with the same error

### Requirement: The scope form settles after the rollback
The result of the scope form SHALL reject with the error of the body, or with the abort reason, only after the last rollback has finished, and SHALL be an `AggregateError` that holds that error first when a rollback failed. A step whose `run` finishes after the abort SHALL be rolled back, and a body that returns after an abort SHALL NOT resolve.

#### Scenario: A slow rollback
- **WHEN** the body fails and `rollback` of the first step takes 100 ms
- **THEN** the result is pending until that `rollback` finishes, then rejects with the error of the body

#### Scenario: The body ignores the abort
- **WHEN** the task is aborted while the body awaits something that is not a step, and the body then returns a value
- **THEN** the finished steps are rolled back and the result rejects with the abort reason

### Requirement: step after an abort or after the end
`step` SHALL throw the abort reason, and SHALL NOT call `run`, when the task of the transaction is already aborted. `step` called after the transaction has settled, for example a function saved by the body and called later, SHALL throw a `TypeError` and SHALL NOT call `run`.

#### Scenario: Step in an aborted task
- **WHEN** the task is aborted and the body calls `step(run)`
- **THEN** `run` is not called and the call rejects with the abort reason

#### Scenario: A saved step is called late
- **WHEN** the body keeps `step`, returns, and the saved `step` is called afterwards
- **THEN** it throws a `TypeError` and `run` is not called

### Requirement: Steps that run at the same time
Steps started by one body with `Promise.all` or similar SHALL be allowed. When they are rolled back, the order SHALL follow the order in which they finished, last finished first, with `rollbackOrder: "reverse"`, and all at once with `"parallel"`.

#### Scenario: Two steps in parallel and then a failure
- **WHEN** the body runs steps A and B together, B finishes first, and the body throws
- **THEN** `rollback` of A is called before `rollback` of B

### Requirement: The options of the scope form are checked early
The options of the transaction SHALL be checked before `body` is called. The options of a step SHALL be checked when `step` is called, before its `run` starts. A wrong value SHALL throw a `RangeError`, and `rollbackFailure: "stop"` with `rollbackOrder: "parallel"` SHALL throw a `TypeError`; the steps that finished before a wrong step option is found SHALL be rolled back as for any error of the body.

#### Scenario: A wrong option of the transaction
- **WHEN** `rollbackOn` of the transaction is `"eror"`
- **THEN** it throws a `RangeError` and the body is not called

#### Scenario: A wrong option of a step
- **WHEN** the third `step` call has `rollbackOn: "eror"`
- **THEN** it throws a `RangeError` before its `run`, and the first two steps are rolled back

#### Scenario: Stop with parallel is rejected before the body
- **WHEN** the options of the transaction have `rollbackFailure: "stop"` and `rollbackOrder: "parallel"`, even if every step would override `rollbackFailure`
- **THEN** it throws a `TypeError` and the body is not called (the steps are not known yet, so the array forms, which see them, may accept the same options)

#### Scenario: Options that are not an object
- **WHEN** the options of the transaction are a value that is neither an object nor `null`
- **THEN** it throws a `TypeError` and the body is not called

#### Scenario: A second function is not options
- **WHEN** `transaction(ctx, body, otherFunction)` is called
- **THEN** it throws a `TypeError`
