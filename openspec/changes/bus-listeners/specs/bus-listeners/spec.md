## ADDED Requirements

### Requirement: Count the listeners of an event

The bus SHALL provide `listeners(event)` that returns the number of listeners registered for that event key at the moment of the call. `event` accepts the same shapes as `on`: a string, `{ type }`, or an action creator. The key `"*"` SHALL count the any-event listeners, and a listener registered for an event SHALL NOT be counted under `"*"`. An event that was never subscribed to SHALL give `0`.

#### Scenario: A listener is counted and its unsubscribe removes it

- **WHEN** a caller registers `const unbind = bus.on("t", fn)`, reads `bus.listeners("t")`, calls `unbind()`, and reads it again
- **THEN** the first read is `1` and the second is `0`

#### Scenario: The same function registered twice counts twice

- **WHEN** a caller registers the same `fn` twice for `"t"`
- **THEN** `bus.listeners("t")` is `2`, and one unsubscribe brings it to `1`

#### Scenario: The event shapes of on are accepted

- **WHEN** a caller registers a listener with an action creator and reads `listeners` with its string `type`, with `{ type }`, and with the creator
- **THEN** all three reads give the same number

#### Scenario: The any-event key is separate

- **WHEN** a caller registers one listener for `"*"` and one for `"t"`
- **THEN** `bus.listeners("*")` is `1`, `bus.listeners("t")` is `1`, and an event never subscribed to is `0`

### Requirement: The count follows once, off and the end of a module

`listeners` SHALL stop counting a `once` listener as soon as it has run, or has been unbound before it ran. `off(event)` and `off()` SHALL be reflected in the next read. The listeners that a module registers with its `on`, and those of a task that were registered with `ctx.on`, SHALL be counted while they are registered and SHALL no longer be counted after the module unmounts or the task aborts.

#### Scenario: once is counted until it runs

- **WHEN** a caller registers `bus.once("t", fn)`, reads `listeners("t")`, emits `"t"`, and reads it again
- **THEN** the first read is `1` and the second is `0`

#### Scenario: off clears the count

- **WHEN** a bus has two listeners on `"t"` and one on `"*"`, and the caller invokes `bus.off("t")` and then `bus.off()`
- **THEN** `listeners("t")` is `0` after the first call, and `listeners("*")` is `0` after the second

#### Scenario: An unmounted module leaves none

- **WHEN** a module registers listeners with its `on` for two events, is mounted, and is unmounted
- **THEN** `listeners` of both events is `1` (or the number registered) while it is mounted and `0` after the unmount

#### Scenario: An aborted task leaves none

- **WHEN** a task registers a listener with `ctx.on` and then its signal aborts
- **THEN** `listeners` of that event no longer counts it

### Requirement: Plugins that wrap on and off stay counted

The count SHALL come from the registrations of the bus itself, so plugins that wrap `on`, `once` or `off` (`matchPlugin`, `devPlugin`, `tracePlugin`, `extendBus`) SHALL NOT change it: a listener is counted once whether or not those plugins are used, and in any order of plugins. A predicate listener of `matchPlugin` SHALL be counted under `"*"`, where it rides.

#### Scenario: devPlugin does not double count

- **WHEN** a bus uses `devPlugin()` and a caller registers one listener for `"t"`
- **THEN** `bus.listeners("t")` is `1`

#### Scenario: A predicate counts under any-event

- **WHEN** a bus uses `matchPlugin` and a caller registers a predicate listener
- **THEN** `bus.listeners("*")` is `1`, and unbinding it brings it to `0`
