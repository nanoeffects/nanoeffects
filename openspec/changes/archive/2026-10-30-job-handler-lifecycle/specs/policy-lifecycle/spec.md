## MODIFIED Requirements

### Requirement: A policy is known to the job that wraps it
A job SHALL tell a handler that is one of the library policies from one that is not, whether the handler is given to `createJob` or bound afterwards. A handler that is not one (no policy, a custom policy, a policy hidden in another function) SHALL be treated as having no policy.

#### Scenario: A policy is present
- **WHEN** a job handler is wrapped in any of the five policies and the job is emitted
- **THEN** the job does not send `pending` until the policy lets the handler start

#### Scenario: A policy given to createJob
- **WHEN** a job is made with `createJob(type, queue(fn, { concurrency: 1 }))` and called twice while the first run goes
- **THEN** the first call sends `pending` at once and the second sends it only after the first run ends

#### Scenario: A call that never starts
- **WHEN** a job made with `createJob(type, queue(fn))` has a call that is aborted while it waits
- **THEN** that call sends none of `pending`, `success`, `fail` or `cancel`

#### Scenario: No policy
- **WHEN** a job handler has no policy, or has one that does not report (a custom policy)
- **THEN** the job sends `pending` when the handler is called, as it does without this change
