# Spec Delta

## MODIFIED Requirements

### Requirement: The outcome is routed on the bus
When the command of a job is emitted, the job SHALL emit `pending(payload)` through the context of the task when the handler really starts, then `success(result)` after the handler succeeds, or `fail(error)` after it fails. Without a policy around the handler it starts when it is called. With a policy it starts when the policy lets it (see `policy-lifecycle`), and a call that never starts sends no outcome. Exactly one of `success`, `fail`, `cancel` SHALL follow a `pending` of the same call, and none SHALL be sent without a `pending`. `success` and `fail` SHALL NOT be emitted once the task of the job is aborted. `cancel(reason)` SHALL be emitted at the moment the task is aborted or a policy cancels the call, after `pending` and not after the handler settles. A job used without a listener of an outcome SHALL run as before.

#### Scenario: Success
- **WHEN** `bus.emit(loadUser("1"))` is called and the handler resolves with a user
- **THEN** a listener of `loadUser.pending` receives `"1"` first, then a listener of `loadUser.success` receives the user, and the promise of the command resolves with the user

#### Scenario: Failure is handled
- **WHEN** the handler rejects with an error
- **THEN** a listener of `loadUser.pending` ran before, a listener of `loadUser.fail` receives the error, and the promise of the command resolves with `undefined`

#### Scenario: An aborted task sends nothing
- **WHEN** the task is aborted after `pending` and before the handler settles, whether the handler later rejects with the abort reason, resolves, or never settles
- **THEN** `loadUser.cancel` is emitted once, at the moment of the abort, with the abort reason, neither `success` nor `fail` is emitted, and the promise of the command resolves with `undefined`

#### Scenario: A flag follows the outcomes
- **WHEN** a store sets `loading` on `pending` and clears it on `success`, `fail` and `cancel`, and the task of the call is aborted with `ctx.abort()` or because its parent is aborted
- **THEN** the flag is `true` while the handler runs and `false` right after the abort, whether the handler rejects with the abort reason or ignores the signal

#### Scenario: A flag under latest
- **WHEN** a store sets `loading` on `pending` and clears it on `success`, `fail` and `cancel`, a job handler is wrapped in `latest(fn)`, and the job is called again while the first run goes
- **THEN** the first run sends `cancel` before the second sends `pending`, so the flag is `true` while the second run goes and `false` when it ends

#### Scenario: A dropped call sends nothing
- **WHEN** a job handler is wrapped in `leading(fn)` and called again while the first run goes
- **THEN** the second call sends nothing and the flag of the first run is not cleared by it

#### Scenario: A throwing listener of cancel
- **WHEN** a listener of `cancel` throws
- **THEN** the promise of the command still resolves with `undefined`

#### Scenario: A listener of pending throws
- **WHEN** a listener of `pending` throws
- **THEN** the handler is not called, `fail` receives the error, and the promise of the command resolves with `undefined`

#### Scenario: Outcomes without a listener
- **WHEN** nobody listens to `pending` or `cancel`
- **THEN** nothing breaks and the call runs as before; like `success` and `fail`, they are events, so `onUnhandled` of the bus (a dev diagnostic) is called for each one nobody listens to

### Requirement: A job without a handler sends no outcome
`pending` SHALL be emitted only when the job has a handler to call. A job with no handler SHALL throw `MissingHandlerError` from `emit` and send none of the four outcomes.

#### Scenario: No handler
- **WHEN** a job made without a handler is emitted and no handler is bound
- **THEN** `emit` throws `MissingHandlerError` and no outcome is sent

#### Scenario: A bound handler
- **WHEN** a handler is bound with `commands.handle`
- **THEN** `pending` is sent before it is called, or when its policy lets it start, and a closing outcome follows, as for the own handler

## REMOVED Requirements

### Requirement: Policies are not known to the job
**Reason**: the policies now report the life of a call to the job (see `policy-lifecycle`), so `pending` and the closing outcome follow what really ran.
**Migration**: a store that counted on `pending` for every call, or on `success(undefined)` for a dropped or replaced call, reads `cancel` for a replaced run and nothing for a dropped call. A counter (`+1` on `pending`, `-1` on `success`, `fail` and `cancel`) is exact for any policy.
