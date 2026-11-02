# Spec Delta

## ADDED Requirements

### Requirement: An event and a task can carry a source
`TraceEvent` SHALL have an optional `source: string` and `TaskInfo` SHALL have the same, set only for a task of a listener that was registered with `tracePlugin({ source: true })`. `Tracer.rename` SHALL take an optional third argument, the source, and `createTracer` SHALL put it on the events and the task info of that task, also on a second `task` call for the rename. A tracer or logger that ignores it SHALL behave as before.

#### Scenario: A logger reads it
- **WHEN** a logger with a `task` method sees a renamed listener with a source
- **THEN** `info.source` is that string

#### Scenario: An old tracer
- **WHEN** a tracer has a `rename` that takes two arguments
- **THEN** it keeps working and the third argument is ignored
