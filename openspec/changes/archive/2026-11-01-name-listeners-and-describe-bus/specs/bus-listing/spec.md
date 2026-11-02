# Spec Delta

## Purpose
Shows who listens to what on a bus before anything runs, as a plain object of event names and listener names, for a developer who reads the code of an app they did not write, and for a test that guards the wiring.

## ADDED Requirements

### Requirement: describeBus lists the listeners of each event
`describeBus(bus)` from `nanoeffects/trace` SHALL return an object whose keys are the events that have a listener (`"*"` among them) and whose values are the names of those listeners in the order they run. A name is the `traceId` or, without one, the function name. A listener with neither SHALL be listed as `"<anonymous>"`. It SHALL read the listeners that were registered through `bus.on` and `bus.once` after `tracePlugin` was used, and SHALL NOT change the bus.

#### Scenario: Two events
- **WHEN** `saveName` and `audit` listen to `name/changed` and `refresh` listens to `saved`
- **THEN** `describeBus(bus)` is `{ "name/changed": ["saveName", "audit"], saved: ["refresh"] }`

#### Scenario: An action creator
- **WHEN** a listener is registered with an action creator instead of a string
- **THEN** it is listed under the type of the creator

#### Scenario: Removed and once
- **WHEN** a listener is removed with `off`, or a `once` listener has run
- **THEN** it is no longer listed, and an event with no listener is not a key

#### Scenario: Anonymous
- **WHEN** an inline arrow without `traceId` is registered
- **THEN** it is listed as `"<anonymous>"`

### Requirement: describeBus does nothing without tracing
When the bus has no tracer, `tracePlugin` was not used, or the build is `notrace`, `describeBus(bus)` SHALL return an empty object, and SHALL NOT throw.

#### Scenario: No plugin
- **WHEN** `describeBus` is called on a bus without `tracePlugin`
- **THEN** the result is `{}`

### Requirement: The registry leaks nothing
The registry that `describeBus` reads SHALL be held by the bus (a `WeakMap` keyed by it) and SHALL drop a listener when it is removed, so a bus that is collected takes it along.

#### Scenario: Many subscribe and unsubscribe
- **WHEN** a listener is added and removed 10 000 times
- **THEN** `describeBus(bus)` is `{}` and the registry holds no entries
