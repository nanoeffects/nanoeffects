## MODIFIED Requirements

### Requirement: createJob returns the command and its actions
`createJob(type, handler, options?)` SHALL return the command of the job, with four properties added: `pending`, the action creator for its start, `success`, the action creator for its success, `fail`, the action creator for its failure, and `cancel`, the action creator for a task that is aborted after it started. It SHALL NOT return a wrapper object. Calling the job SHALL build `{ type, payload }` like any command and SHALL NOT run the handler until emit.

#### Scenario: The three parts
- **WHEN** `const loadUser = createJob("user/load", fetchUser)` is called
- **THEN** `loadUser` is a command with the type `user/load`, and `loadUser.pending`, `loadUser.success`, `loadUser.fail` and `loadUser.cancel` are action creators

#### Scenario: It is emitted as a command
- **WHEN** `bus.emit(loadUser("1"))` is called
- **THEN** the handler runs as a task and the promise of the command resolves with its result

### Requirement: Strings make action creators
When `pending`, `success`, `fail` or `cancel` is a string, the job SHALL make an action creator of that type with `createAction`; the payload of the pending action SHALL be the payload of the call, the payload of the success action the result of the handler, the payload of the fail action the error and the payload of the cancel action the abort reason of the task.

#### Scenario: Types given as strings
- **WHEN** `createJob("user/load", fetchUser, { pending: "user/loading", success: "user/loaded", fail: "user/failed", cancel: "user/cancelled" })` is called
- **THEN** the four creators have those types, and `success(user)` is `{ type: "user/loaded", payload: user }`

#### Scenario: The made actions are typed
- **WHEN** a job is made with strings
- **THEN** the payload type of `pending` is the payload type of the handler, of `success` the awaited result type, of `fail` and `cancel` `unknown`, and the literal types of all four are kept

### Requirement: Existing action creators are used as they are
When `pending`, `success`, `fail` or `cancel` is an action creator, the job SHALL use it for routing and SHALL expose that same creator under the same property of the command.

#### Scenario: A given creator is returned
- **WHEN** `const loading = createAction<string>("user/loading")` and `createJob("user/load", fetchUser, { pending: loading })` are called
- **THEN** the `pending` property of the returned command is `loading`

### Requirement: Missing options get default types
When an outcome is not given, the job SHALL make the action creator with the type `<type>/pending`, `<type>/success`, `<type>/fail` or `<type>/cancel`.

#### Scenario: Defaults
- **WHEN** `createJob("user/load", fetchUser)` is called with no options
- **THEN** the types are `user/load/pending`, `user/load/success`, `user/load/fail` and `user/load/cancel`

### Requirement: The outcome is routed on the bus
When the command of a job is emitted, the job SHALL emit `pending(payload)` through the context of the task just before the handler is called, then `success(result)` after the handler succeeds, or `fail(error)` after it fails, and SHALL NOT emit `success` or `fail` once the task of the job is aborted. Exactly one of `success`, `fail`, `cancel` SHALL follow a `pending` of the same task. A job used without a listener of an outcome SHALL run as before.

#### Scenario: Success
- **WHEN** `bus.emit(loadUser("1"))` is called and the handler resolves with a user
- **THEN** a listener of `loadUser.pending` receives `"1"` first, then a listener of `loadUser.success` receives the user, and the promise of the command resolves with the user

#### Scenario: Failure is handled
- **WHEN** the handler rejects with an error
- **THEN** a listener of `loadUser.pending` ran before, a listener of `loadUser.fail` receives the error, and the promise of the command resolves with `undefined`

#### Scenario: An aborted task sends nothing
- **WHEN** the task is aborted after `pending` and before the handler settles, whether the handler rejects with the abort reason or ignores the signal and resolves later
- **THEN** neither `success` nor `fail` is emitted, and `loadUser.cancel` is emitted once with the abort reason as the only closing outcome, and the promise of the command resolves with `undefined`

#### Scenario: A flag follows the outcomes
- **WHEN** a store sets `loading` on `pending` and clears it on `success`, `fail` and `cancel`, and the task of the call is aborted with `ctx.abort()` or because its parent is aborted
- **THEN** the flag is `true` while the handler runs and `false` after the handler settles, whether it rejects with the abort reason or ignores the signal

#### Scenario: A throwing listener of cancel
- **WHEN** a listener of `cancel` throws
- **THEN** the promise of the command still resolves with `undefined`

#### Scenario: A listener of pending throws
- **WHEN** a listener of `pending` throws
- **THEN** the handler is not called, `fail` receives the error, and the promise of the command resolves with `undefined`

#### Scenario: Outcomes without a listener
- **WHEN** nobody listens to `pending` or `cancel`
- **THEN** nothing breaks and the call runs as before; like `success` and `fail`, they are events, so `onUnhandled` of the bus (a dev diagnostic) is called for each one nobody listens to

## ADDED Requirements

### Requirement: A job without a handler sends no outcome
`pending` SHALL be emitted only when the job has a handler to call. A job with no handler SHALL throw `MissingHandlerError` from `emit` and send none of the four outcomes.

#### Scenario: No handler
- **WHEN** a job made without a handler is emitted and no handler is bound
- **THEN** `emit` throws `MissingHandlerError` and no outcome is sent

#### Scenario: A bound handler
- **WHEN** a handler is bound with `commands.handle`
- **THEN** `pending` is sent before it is called and a closing outcome follows, as for the own handler

### Requirement: Policies are not known to the job
`pending` SHALL be emitted for every call of the job that has a handler, before a policy that wraps the handler decides what to do with the call. The job SHALL NOT change the policies. This is a limit of this change, documented next to the recipe.

#### Scenario: A dropped call under a policy
- **WHEN** a handler wrapped in `leading` is called twice while the first call runs
- **THEN** each call sends `pending` and a closing outcome; the dropped call closes with `success(undefined)`

#### Scenario: A replaced run under latest
- **WHEN** a handler wrapped in `latest` is called again while the first call runs
- **THEN** the task of the job is not aborted, so the replaced call closes with `success(undefined)` and sends no `cancel`
