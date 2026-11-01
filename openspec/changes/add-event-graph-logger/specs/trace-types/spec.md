## ADDED Requirements

### Requirement: The events of a named listener say which event it handles
A task of a listener that `tracePlugin` named with `traceId` has `type` set to that name. Its trace events SHALL also carry `event`: the type of the event the listener handles. A task that is not renamed SHALL have no `event`, because its `type` already is the event. `TraceEvent` SHALL have `event?: string`, and `Tracer.rename` SHALL keep working for a tracer that ignores it.

#### Scenario: A named listener
- **WHEN** `bus.on("total/changed", syncCart, { traceId: "syncCart" })` is used and `total/changed` is emitted
- **THEN** the events of that task have `type: "syncCart"` and `event: "total/changed"`

#### Scenario: A listener with no name
- **WHEN** a listener of `total/changed` has no `traceId`
- **THEN** its events have `type: "total/changed"` and no `event`

#### Scenario: A tracer without rename
- **WHEN** a custom tracer has no `rename`
- **THEN** the bus works and the events have no `event`

#### Scenario: Existing loggers
- **WHEN** `consoleLogger`, `performanceLogger`, `reduxDevtools` or a recorder get an event with `event`
- **THEN** they behave as before (the field is not printed or sent unless the logger chooses to)
