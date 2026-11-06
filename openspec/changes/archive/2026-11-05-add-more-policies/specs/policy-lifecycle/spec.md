# Spec Delta

## ADDED Requirements

### Requirement: The newer policies report their calls to the job
`dedupe`, `distinct`, `rateLimit` and `batch` SHALL be known to the job as library policies, so a job sends `pending` only when the handler really starts and sends nothing for a call that ends without starting (a call that joins a shared run, a skipped one, a dropped one, a call that waits and aborts, a call taken out of a batch). Each started call SHALL have exactly one closing outcome.

#### Scenario: A shared run
- **WHEN** a job handler is `dedupe(fn)` and the job is emitted twice with one payload while the first run goes
- **THEN** the job sends one `pending` and one `success`

#### Scenario: A skipped repeat
- **WHEN** a job handler is `distinct(fn)` and the job is emitted twice with one payload
- **THEN** the second emit sends none of `pending`, `success`, `fail` or `cancel`

#### Scenario: A delayed call
- **WHEN** a job handler is `rateLimit(1, 100, fn)` and the job is emitted twice at once
- **THEN** the second `pending` is sent 100 ms later, when `fn` starts

#### Scenario: One batch
- **WHEN** a job handler is `batch(100, fn)` and the job is emitted three times in one window
- **THEN** the job sends one `pending` and one closing outcome
