# Spec Delta

## ADDED Requirements

### Requirement: A listener is named by its function when no traceId is given
With `tracePlugin` on a bus that has a tracer, `bus.on(event, handler)` and `bus.once(event, handler)` with no `traceId` SHALL name the listener by `handler.name` when it is a non-empty string, as `{ traceId }` would. A handler with an empty name SHALL run as it does without the plugin. An explicit `traceId` SHALL win over the name. Payload, context, results and errors SHALL be the same as without the plugin.

#### Scenario: A declared function
- **WHEN** `function saveName(name) {}` is registered with `bus.on("name/changed", saveName)` and the event is emitted
- **THEN** the trace has a `run` task named `saveName` below the task of the emit

#### Scenario: An anonymous handler
- **WHEN** an inline arrow is registered with `bus.on(event, (payload) => {})`
- **THEN** it is not renamed and the trace shows what it showed before

#### Scenario: traceId wins
- **WHEN** `saveName` is registered with `{ traceId: "saveNotifier" }`
- **THEN** the task is named `saveNotifier`

#### Scenario: Off
- **WHEN** a listener named by its function is removed with `bus.off(event, handler)`
- **THEN** the event no longer calls it

#### Scenario: No plugin, no tracer, notrace
- **WHEN** the bus has no tracer, the plugin is not used, or the build is `notrace`
- **THEN** handlers run as they are and nothing is renamed
