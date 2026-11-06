# Spec Delta

## Purpose

Skips a call that would repeat the payload of the previous accepted call, so the same draft, query or sensor reading does not start the same work twice in a row. It remembers one payload per key and never a result.

## ADDED Requirements

### Requirement: A repeated payload is skipped
`distinct(fn, options?)` SHALL run `fn` for a call whose payload differs from the last accepted payload of its key, and SHALL skip a call whose payload equals it. Payloads are equal when `Object.is` says so, or when `options.equals(previous, next)` returns `true`. A skipped call SHALL not run `fn` and SHALL resolve with `undefined`. The first call of a key is always accepted.

#### Scenario: The same primitive twice
- **WHEN** `distinct(search)` is called with `"redux"` and then again with `"redux"`
- **THEN** `search` runs once and the second call returns `undefined`

#### Scenario: A change in between
- **WHEN** it is called with `"a"`, `"b"` and `"a"`
- **THEN** `search` runs three times

#### Scenario: Equal objects with a comparer
- **WHEN** `distinct(save, { equals: (a, b) => a.id === b.id && a.text === b.text })` gets two different objects with the same fields
- **THEN** `save` runs once

#### Scenario: Equal objects without a comparer
- **WHEN** `distinct(save)` gets two different objects with the same fields
- **THEN** `save` runs twice, because `Object.is` tells them apart

### Requirement: Only a payload that did not fail is remembered
A payload SHALL be remembered from the moment its run starts, so the same payload that arrives while the run goes is skipped. It SHALL be forgotten when its run rejects or when its task is aborted, so a retry with the same payload runs. A payload whose run resolved SHALL stay remembered, and a skipped call SHALL not change what is remembered.

#### Scenario: A retry after an error
- **WHEN** a run for `"draft"` rejects and `"draft"` is sent again
- **THEN** `fn` runs again

#### Scenario: A repeat while the run goes
- **WHEN** `"draft"` is sent again while its first run has not settled
- **THEN** the second call is skipped

#### Scenario: A retry after an abort
- **WHEN** the task of a run for `"draft"` aborts and `"draft"` is sent again
- **THEN** `fn` runs again

### Requirement: Each key remembers its own payload
With `options.key` the last payload SHALL be kept per key, and calls with different keys SHALL NOT affect each other. State of a key is kept after its run, because that is what the policy remembers, so keys SHOULD come from a bounded set.

#### Scenario: Two keys
- **WHEN** `distinct(save, { key: (draft) => draft.id })` gets a draft with `id` 1, then one with `id` 2, then the first draft again unchanged
- **THEN** `save` runs for the first two and the third is skipped

### Requirement: Distinct reports its calls to a job
A skipped call SHALL be reported to a job as ended without starting, so the job sends none of `pending`, `success`, `fail` or `cancel` for it. An accepted call SHALL be reported as starting when `fn` is called and with its outcome when it settles.

#### Scenario: A skipped job call
- **WHEN** a job handler is `distinct(fn)` and the job is emitted twice with the same payload
- **THEN** the job sends one `pending` and one `success`

### Requirement: Distinct takes the same forms as the other policies
`distinct` SHALL be callable as `distinct(fn, options?)`, `distinct(options)(fn)` and `distinct({ key })(fn)`, SHALL work through `withPolicy` and `usePolicy`, SHALL run an accepted call as `fn` does (a synchronous result stays synchronous), and a `null` option SHALL fall back to its default. A call whose task is aborted already SHALL do nothing.

#### Scenario: Synchronous handler
- **WHEN** `distinct((value) => value * 2)` is called with `2` for the first time
- **THEN** it returns `4`, not a promise

#### Scenario: Plain function
- **WHEN** `withPolicy(distinct(fn))` is called twice with the same payload
- **THEN** `fn` runs once
