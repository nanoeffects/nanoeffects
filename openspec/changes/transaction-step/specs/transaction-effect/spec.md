## ADDED Requirements

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

## MODIFIED Requirements

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
