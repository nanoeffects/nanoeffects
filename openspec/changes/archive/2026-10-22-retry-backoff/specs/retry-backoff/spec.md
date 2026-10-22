## ADDED Requirements

### Requirement: backoff builds a delay function
`backoff(options)` from `nanoeffects/effects` SHALL return a function `(attempt) => ms` that can be passed as the `delay` of `retry` and `poll`. The pause SHALL be `base * factor ** (attempt - 1)`, at most `max`. Defaults: `base` 100 ms, `factor` 2, `max` `Infinity`, `jitter` off.

#### Scenario: Exponential growth
- **WHEN** `backoff({ base: 100 })` is called with attempts 1, 2, 3
- **THEN** it returns 100, 200, 400

#### Scenario: The cap
- **WHEN** `backoff({ base: 100, max: 250 })` is called with attempt 3
- **THEN** it returns 250

#### Scenario: Used by retry
- **WHEN** `retry(task, { times: 3, delay: backoff({ base: 100 }) })` fails twice
- **THEN** the pauses before the second and the third attempt are 100 ms and 200 ms

### Requirement: Jitter spreads the pauses
With `jitter: true` the pause SHALL be a random value between 0 and the computed pause (full jitter), and never more than `max`. Randomness SHALL come from `Math.random`, so tests can control it.

#### Scenario: Within bounds
- **WHEN** `backoff({ base: 100, jitter: true })` is called with attempt 3
- **THEN** the result is at least 0 and at most 400

#### Scenario: Deterministic with a fixed random
- **WHEN** `Math.random` returns `0.5` and `backoff({ base: 100, jitter: true })` is called with attempt 2
- **THEN** it returns 100

### Requirement: Options are forgiving
Options that are `null` (plain JavaScript callers) SHALL fall back to the defaults. A `base` or `max` that is negative or `NaN` SHALL be treated as 0, as the timers of the library do.

#### Scenario: null options
- **WHEN** `backoff({ base: null })` is called with attempt 1
- **THEN** it returns the default base of 100
