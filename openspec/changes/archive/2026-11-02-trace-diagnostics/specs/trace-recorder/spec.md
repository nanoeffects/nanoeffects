## ADDED Requirements

### Requirement: The recorder remembers the tasks that report nothing
`createTraceRecorder()` SHALL remember every task the tracer tells it about, also a task that reports no event (a plain listener), as `recorder.tasks`: a read-only map from task `id` to its `type`, and its `parentId`, `source` and `traceGroupId` when known. A renamed task SHALL be updated. With a positive integer `capacity`, the recorder SHALL keep at most `capacity` tasks, the latest made ones. `clear()` SHALL empty `tasks` too. `toJSON()` SHALL stay the list of events.

#### Scenario: A silent listener is known
- **WHEN** a listener of `queryChanged` runs and reports no event
- **THEN** `recorder.tasks` has an entry for it with the type of the listener and the id of its parent

#### Scenario: A rename
- **WHEN** a task is renamed after it was made
- **THEN** its entry has the new type

#### Scenario: Capacity bounds the tasks
- **WHEN** a recorder with `capacity` of 2 is told about three tasks
- **THEN** `recorder.tasks` holds the last two

#### Scenario: Clear
- **WHEN** `clear()` is called
- **THEN** `recorder.tasks` is empty
