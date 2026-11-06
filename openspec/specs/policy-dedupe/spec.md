# policy-dedupe Specification

## Purpose
Lets several callers that ask for the same thing at the same time share one run of a handler, so a request is not sent twice and every caller still gets the result. It is not a cache: a run that has settled leaves nothing behind.

## Requirements

### Requirement: Calls with the same key share one run
`dedupe(fn, options?)` SHALL start `fn` for the first call of a key and SHALL make every call with the same key that arrives while that run is going wait for it, so `fn` runs once and every caller resolves with its result or rejects with its error (each call still gets a promise of its own). Without `options.key` the key SHALL be the payload itself, compared as a `Map` key (`SameValueZero`).

#### Scenario: Two calls with the same id
- **WHEN** `dedupe(getUser)` is called with `1` and, before it settles, with `1` again
- **THEN** `getUser` runs once and both promises resolve with the same user

#### Scenario: Different payloads do not share
- **WHEN** `dedupe(getUser)` is called with `1` and then with `2` while the first run goes
- **THEN** `getUser` runs twice, once for each

#### Scenario: A key function
- **WHEN** `dedupe(save, { key: (draft) => draft.id })` gets two different objects with the same `id` while a run goes
- **THEN** `save` runs once and both callers get its result

#### Scenario: One shared state
- **WHEN** `dedupe(refresh, { key: () => "all" })` is called twice with any payloads while a run goes
- **THEN** `refresh` runs once and both callers get its result

#### Scenario: A shared error
- **WHEN** the shared run rejects
- **THEN** every caller that waits for it rejects with that same error

### Requirement: Nothing is kept after a run settles
When a run settles, whether by a value or an error, `dedupe` SHALL forget it: the next call with that key SHALL start `fn` again. The state of an idle key SHALL be dropped, so keys can be unbounded.

#### Scenario: A call after the run
- **WHEN** the first run has resolved and the same key is called again
- **THEN** `fn` runs again and does not return the earlier value

#### Scenario: A call after a failure
- **WHEN** the first run has rejected and the same key is called again
- **THEN** `fn` runs again

### Requirement: Aborting one caller does not take the result from the others
A call whose task aborts SHALL resolve with `undefined` and SHALL leave the others as they are. The run belongs to the task of the call that started it: when that task aborts while other callers still wait, the run SHALL be aborted and started again with the context of the first caller that is still live, so those callers get a result. When no live caller is left nothing SHALL run.

#### Scenario: A follower aborts
- **WHEN** a second caller joins a run and its task aborts
- **THEN** its promise resolves with `undefined` and the run and the first caller go on

#### Scenario: The owner aborts
- **WHEN** the task that started the run aborts while a second, live caller waits
- **THEN** the signal of the first run is aborted, `fn` starts again with the context of the second caller, and the second caller resolves with that run's result

#### Scenario: Everyone aborts
- **WHEN** every task that waits for the run has aborted
- **THEN** the run is aborted, no new run starts and every promise resolves with `undefined`

#### Scenario: A call that is aborted already
- **WHEN** a call arrives whose task is aborted
- **THEN** it resolves with `undefined` and starts nothing

### Requirement: Dedupe reports its calls to a job
The call that starts a run SHALL tell a job around it that its handler starts and how it settled; a call that joins a run SHALL be reported as ended without starting. A run SHALL have exactly one closing outcome, so a job sends one `pending` and one `success` or `fail` for a shared run. When the owner is replaced after an abort, the first run SHALL be reported as cancelled and the new run as started.

#### Scenario: A job with two callers
- **WHEN** a job handler is `dedupe(fn)` and the job is emitted twice with the same payload while the first run goes
- **THEN** the job sends one `pending` and one `success`, and both emits resolve with the value

### Requirement: Dedupe takes the same forms as the other policies
`dedupe` SHALL be callable as `dedupe(fn, options?)`, `dedupe(options)(fn)` and `dedupe({ key })(fn)` with the payload type taken from `key`, SHALL return a promise for every call, and SHALL work through `withPolicy` and `usePolicy`. A `null` option SHALL fall back to its default.

#### Scenario: Curried form
- **WHEN** `dedupe({ key: (id) => id })(fn)` is called
- **THEN** it behaves as `dedupe(fn, { key: (id) => id })`

#### Scenario: Plain function
- **WHEN** `withPolicy(dedupe(fn))` is called twice with the same payload before the first settles
- **THEN** `fn` runs once
