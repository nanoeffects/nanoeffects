## ADDED Requirements

### Requirement: The job-worker example queues emails and answers at once
`examples/job-worker/` SHALL be a TypeScript project that starts with `npm start`, is a Fastify app that uses only `fastify` and `nanoeffects`, and sends emails through a fake mailer with no network. `POST /emails` with `{ to, subject }` SHALL answer 202 with an `id` before the email is sent and SHALL queue the job without waiting for it. The job SHALL be `email/send`, made with `createJob`, and its handler SHALL be bound in a module.

#### Scenario: Accept and answer
- **WHEN** a client posts an email
- **THEN** the answer is 202 at once, and the email is sent later by the worker

### Requirement: The worker limits, retries and gives up
The handler of the job SHALL run under `queue` with `concurrency` 3, around `retry` with a growing pause, around `timeout` for each attempt. The fake mailer SHALL fail every fourth attempt with an error that means "try again" (status 503), SHALL never answer for a subject that starts with `/hang`, and SHALL fail at once with an error that means "no" (status 400) for a subject that starts with `/bad`. An error below 500 and a timeout SHALL NOT be retried.

#### Scenario: Never more than three at once
- **WHEN** ten emails are queued
- **THEN** at most three are being sent at any moment

#### Scenario: A failure that passes
- **WHEN** an attempt fails with a 503
- **THEN** it is tried again and the email is sent

#### Scenario: A mailer that does not answer
- **WHEN** a subject starts with `/hang`
- **THEN** the attempt is stopped by the timeout and the email fails without a retry

#### Scenario: An answer that is a no
- **WHEN** a subject starts with `/bad`
- **THEN** the email fails at once and is not tried again

### Requirement: The counts come from the outcomes of the job
`GET /stats` SHALL answer `{ queued, running, sent, failed, cancelled }`. `sent`, `failed` and `cancelled` SHALL count the outcomes `success`, `fail` and `cancel`, `running` SHALL be the calls that have sent `pending` and not yet one of those three, and `queued` SHALL be the emails accepted minus those that have started. The counts SHALL add up to the number of emails accepted once the worker is idle.

#### Scenario: Counts add up
- **WHEN** the worker has finished every queued email
- **THEN** `sent + failed + cancelled` equals the number accepted, and `queued` and `running` are 0

### Requirement: Shutdown stops intake, drains, then aborts the rest
On SIGTERM or SIGINT the server SHALL first stop taking emails, so `POST /emails` answers 503. It SHALL then wait until `queued` and `running` are 0 or until `DRAIN_MS` (default 5000) has passed, and then print the counts and exit with 0.

#### Scenario: Intake stops
- **WHEN** shutdown starts and a client posts an email
- **THEN** the answer is 503 and nothing is queued

#### Scenario: The drain finishes in time
- **WHEN** the emails in flight finish before `DRAIN_MS`
- **THEN** the process exits at once with 0 and none is cancelled

#### Scenario: The deadline passes
- **WHEN** emails are still running or waiting after `DRAIN_MS`
- **THEN** the counts show them in `cancelled`, and the process exits with 0

### Requirement: The deadline aborts what is left through the signal of the emit
After `DRAIN_MS`, the server SHALL abort the signal that every `bus.emit` of the job was given, so the calls still running or waiting end with the outcome `cancel` and resolve without a result. Unmounting the module SHALL NOT be used to stop work, because it does not stop a call that is running.

#### Scenario: Work is stopped by the signal
- **WHEN** the deadline passes while emails are running
- **THEN** their outcome is `cancel`, and a call that was running has its `ctx.signal` aborted

### Requirement: The example is tested and passes the project gates
`src/tests/backend-examples.test.ts` SHALL run the worker with a fake mailer and fake timers and cover the limit of three, the retry, the timeout, the counts, the answer 202 before sending and the three steps of the shutdown. `examples/job-worker/` SHALL pass `pnpm tsgo` and `pnpm check`, SHALL NOT be part of the published package, SHALL NOT change anything in `src/`, and SHALL add no dependency to the published package (its dev dependencies are `fastify`, `@fastify/websocket` and `@types/ws` in the root `package.json`).

#### Scenario: Gates
- **WHEN** `pnpm verify` runs
- **THEN** it passes with the example and its tests in the repository
