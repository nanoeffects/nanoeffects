# trace-timing Specification

## Purpose
Defines how `timingLogger` measures the duration of traced tasks and lists the ones still open, so a test or an app can find a slow handler or a task that was left running.

## Requirements

### Requirement: A timing logger measures the duration of closed tasks
`timingLogger()` SHALL return a trace logger that, for each task, records the time between the event with phase `start` and the first event with phase `done`, `error`, `cancel` or `drop` of the same task and effect. `durations` SHALL list the closed tasks, oldest closed first, each with `id`, `type`, `effect`, the closing `phase`, `ms`, and `parentId`, `rootId` and `source` when the event has them.

#### Scenario: A finished task
- **WHEN** a task reports `start`, the clock moves 40 ms, and it reports `done`
- **THEN** `durations` has one entry for it with `phase` `done` and `ms` of 40

#### Scenario: A cancelled task
- **WHEN** a task reports `start`, the clock moves 15 ms, and it reports `cancel`
- **THEN** `durations` has one entry with `phase` `cancel` and `ms` of 15

#### Scenario: A failed task
- **WHEN** a task reports `start` and then `error`
- **THEN** `durations` has one entry with `phase` `error`

#### Scenario: A closing event with no start
- **WHEN** a task reports `done` without a `start` the logger saw
- **THEN** `durations` gets no entry for it and nothing throws

#### Scenario: Only the first closing phase counts
- **WHEN** a task reports `start`, `cancel`, and then `done`
- **THEN** `durations` has one entry for it, with phase `cancel`

### Requirement: The timing logger reads time when the event arrives
Time SHALL be read when the logger receives the event, from `options.now` when given and otherwise from a monotonic clock.

#### Scenario: An injected clock
- **WHEN** `timingLogger({ now })` is given a function that returns a number
- **THEN** every duration is the difference of two values of that function

### Requirement: A timing logger lists the tasks that are still open
`timingLogger().pending()` SHALL return the tasks that reported `start` and have not reported a closing phase, oldest started first, each with `id`, `type`, `effect`, `parentId`, `rootId`, `source` when known, and `ms`, the time since `start`.

#### Scenario: Nothing is left
- **WHEN** every task that started has also closed
- **THEN** `pending()` is an empty list

#### Scenario: A task still runs
- **WHEN** a task has reported `start` and nothing else
- **THEN** `pending()` lists it with the time since `start`

#### Scenario: A dropped call is not open
- **WHEN** a call reports `drop`
- **THEN** `pending()` does not list it

### Requirement: A timing logger can be emptied and bounded
`timingLogger().clear()` SHALL empty `durations` and `pending()`. `timingLogger({ capacity })` with a positive integer SHALL keep only the last `capacity` entries of `durations`; `pending()` SHALL NOT be cut.

#### Scenario: Clear
- **WHEN** `clear()` is called
- **THEN** `durations` is empty and `pending()` is empty

#### Scenario: Capacity
- **WHEN** a logger with `capacity` of 2 sees three tasks close
- **THEN** `durations` lists the last two
