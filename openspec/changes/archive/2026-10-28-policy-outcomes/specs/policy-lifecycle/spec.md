# Spec Delta

## Purpose

Defines what the policies (`latest`, `leading`, `debounce`, `throttle`, `queue`) tell the job around them about a call, so the job can send `pending` and a closing outcome that match what really ran. Without a job the policies behave as before.

## ADDED Requirements

### Requirement: A policy is known to the job that wraps it
A job SHALL tell a handler that is one of the library policies from one that is not, when the handler is bound. A handler that is not one (no policy, a custom policy, a policy hidden in another function) SHALL be treated as having no policy.

#### Scenario: A policy is present
- **WHEN** a job handler is wrapped in any of the five policies and the job is emitted
- **THEN** the job does not send `pending` until the policy lets the handler start

#### Scenario: No policy
- **WHEN** a job handler has no policy, or has one that does not report (a custom policy)
- **THEN** the job sends `pending` when the handler is called, as it does without this change

### Requirement: A policy tells when the handler really starts
A policy SHALL tell the job when it calls the handler for that call: at once for `leading`, `queue` (when its turn comes), `throttle` (on its leading or trailing run), and for `debounce` and `latest` when the wait is over and the run begins. It SHALL tell once per call.

#### Scenario: A debounced call
- **WHEN** a job handler is wrapped in `debounce(100, fn)` and called
- **THEN** `pending` is sent 100 ms later, when `fn` starts, not at the call

#### Scenario: A queued call
- **WHEN** a job handler is wrapped in `queue(fn)` and called twice, the first run being slow
- **THEN** the first call sends `pending` at once and the second sends it only after the first run ends

### Requirement: A policy tells when a call ends without running
A policy SHALL tell the job when it ends a call that never started: dropped by `leading`, `throttle` or `queue` limits, replaced while it waited in `debounce`, `throttle` or `queue`, or aborted before its turn. The job SHALL send nothing for such a call, and the promise of the call SHALL resolve as it does without a job.

#### Scenario: A dropped second click
- **WHEN** a job handler is wrapped in `leading(fn)` and called twice while the first run goes
- **THEN** the second call sends neither `pending` nor a closing outcome and its promise resolves with `undefined`

#### Scenario: A replaced wait
- **WHEN** a job handler is wrapped in `debounce(100, fn)` and called twice within 100 ms
- **THEN** one `pending` is sent for the run of the second call and none for the first

### Requirement: A policy tells when it cancels a started call
When a policy aborts a call that has started, as `latest` does with the previous run, it SHALL tell the job at that moment, with the abort reason, before the next call is allowed to start.

#### Scenario: Latest replaces a run
- **WHEN** a job handler is wrapped in `latest(fn)` and called twice while the first run goes
- **THEN** the first call sends `cancel` and the second sends `pending`, in that order, and the first call never sends `success`

### Requirement: A queue closes a call before it starts the next
When a handler settles, `queue` SHALL tell the job before it starts the next waiting call, so the closing outcome of one call comes before the `pending` of the next.

#### Scenario: Two queued calls
- **WHEN** a job handler is wrapped in `queue(fn)` and called twice
- **THEN** the order of outcomes is `pending`, `success`, `pending`, `success`

### Requirement: Policies work the same without a job
A policy that is not called by a job SHALL behave as before this change and SHALL NOT need a job, a bus or a lifecycle object. A call with no lifecycle object on its context SHALL cost one property read for each of its reports.

#### Scenario: A policy on a plain bus
- **WHEN** `bus.on("search", latest(fn))` is used and the event is emitted twice
- **THEN** the first run is aborted and only the second delivers, as before

#### Scenario: A policy outside a bus
- **WHEN** `withPolicy(debounce(100, fn))` is called
- **THEN** it works as before and reports to nobody

### Requirement: The key is not in the bus
The lifecycle key and its type SHALL live in `src/core` outside the code that `createBus` imports, so `createBus` does not grow, and in `src/policies` a policy SHALL NOT import `actions`.

#### Scenario: Size
- **WHEN** `createBus` alone is bundled
- **THEN** it does not contain the lifecycle key
