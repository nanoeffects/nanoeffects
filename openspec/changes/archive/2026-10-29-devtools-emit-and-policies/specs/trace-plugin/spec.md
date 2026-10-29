## ADDED Requirements

### Requirement: Each emit is reported as an event
On a bus with a tracer, `tracePlugin` SHALL report one event for each call of `bus.emit`, before its handlers run: `type` is the event name, `effect` is `"emit"`, `phase` is `"done"`, `payload` is the payload of the call. It SHALL do so whatever the listeners are (none, plain functions, commands). Without the plugin, without a tracer, or in the `notrace` build, no such event SHALL be reported.

#### Scenario: An emit with no listener
- **WHEN** `bus.emit("search", "q")` runs with no listener on a bus with a tracer and `tracePlugin`
- **THEN** the logger gets one event `search` with `effect: "emit"` and `phase: "done"`, and `onUnhandled` is called as before

#### Scenario: A listener that reports nothing
- **WHEN** the only listener of `search` is a plain function, with no policy and no `ctx.run`
- **THEN** the logger still gets the `emit` event of `search`

#### Scenario: No plugin
- **WHEN** the bus has a tracer and `tracePlugin` is not used
- **THEN** no event with `effect: "emit"` is reported

### Requirement: The emit event follows the task that emits
The `emit` event of an emit made from a task (`ctx.emit`) SHALL have that task as its parent, and SHALL carry the `traceGroupId` of the call.

#### Scenario: A nested emit
- **WHEN** a handler task emits `found` with `ctx.emit`
- **THEN** the `emit` event of `found` has the `id` of that task as its `parentId`

### Requirement: The emit event changes nothing else
The `emit` event SHALL NOT change the `parentId` links, the `rootId` or the `traceGroupId` of any other task, and SHALL NOT change what `emit` returns or throws.

#### Scenario: Other tasks are untouched
- **WHEN** the same flow runs with and without `tracePlugin`
- **THEN** every other event has the same `type`, `effect`, `phase`, `parentId` (as a link between the same tasks), `rootId` and `traceGroupId`
