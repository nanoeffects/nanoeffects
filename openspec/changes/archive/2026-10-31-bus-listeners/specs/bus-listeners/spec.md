## ADDED Requirements

### Requirement: Read the listeners of an event

The bus SHALL provide `get(event?)` that returns the listeners registered for that event name at the moment of the call, as an array whose length is their number. `event` is the event name as a string; for an action creator the caller passes its `type`. Without a name `get()` SHALL return every listener of every event, the any-event ones included. The name `"*"` SHALL give the any-event listeners, and a listener registered for an event SHALL NOT appear under `"*"`. An event that was never subscribed to SHALL give an empty array. The array SHALL NOT change after it was returned: a later registration or removal gives the next call a new array.

#### Scenario: A listener is listed and its unsubscribe removes it

- **WHEN** a caller registers `const unbind = bus.on("t", fn)`, reads `bus.get("t")`, calls `unbind()`, and reads it again
- **THEN** the first array has one listener and the second is empty

#### Scenario: The same function registered twice is listed twice

- **WHEN** a caller registers the same `fn` twice for `"t"`
- **THEN** `bus.get("t").length` is `2`, and one unsubscribe brings it to `1`

#### Scenario: The any-event key is separate

- **WHEN** a caller registers one listener for `"*"` and one for `"t"`
- **THEN** `bus.get("*").length` is `1`, `bus.get("t").length` is `1`, and an event never subscribed to gives an empty array

#### Scenario: No name gives every listener

- **WHEN** a caller registers one listener for `"a"`, one for `"b"` and one for `"*"`, and reads `bus.get()`
- **THEN** the array has all three, and after `bus.off()` it is empty

#### Scenario: A returned array is not changed later

- **WHEN** a caller reads `bus.get("t")` and then registers another listener for `"t"`
- **THEN** the first array keeps its length and the next `bus.get("t")` has one more

### Requirement: The list follows once, off and the end of a module

`get` SHALL stop listing a `once` listener as soon as it has run, or has been unbound before it ran. `off(event)` and `off()` SHALL be reflected in the next read. The listeners that a module registers with its `on`, and those a task registered with `ctx.on`, SHALL be listed while they are registered and SHALL not be listed after the module unmounts or the task aborts.

#### Scenario: once is listed until it runs

- **WHEN** a caller registers `bus.once("t", fn)`, reads `bus.get("t")`, emits `"t"`, and reads it again
- **THEN** the first array has one listener and the second is empty

#### Scenario: off clears the list

- **WHEN** a bus has two listeners on `"t"` and one on `"*"`, and the caller invokes `bus.off("t")` and then `bus.off()`
- **THEN** `bus.get("t")` is empty after the first call, and `bus.get("*")` is empty after the second

#### Scenario: An unmounted module leaves none

- **WHEN** a module registers listeners with its `on` for two events, is mounted, and is unmounted
- **THEN** each event lists its listener while the module is mounted and is empty after the unmount

#### Scenario: An aborted task leaves none

- **WHEN** a task registers a listener with `ctx.on` and then its signal aborts
- **THEN** `bus.get` of that event no longer lists it

### Requirement: Plugins that wrap on and off stay listed once

The list SHALL come from the registrations of the bus itself, so plugins that wrap `on`, `once` or `off` (`matchPlugin`, `devPlugin`, `tracePlugin`, `extendBus`, `modulePlugin`) SHALL NOT change it: a listener is listed once whether or not those plugins are used, and in any order of plugins. A predicate listener of `matchPlugin` SHALL be listed under `"*"`, where it rides. `modulePlugin` holds the `on`, `once` and `off` calls made before its first use; a call of `get` SHALL count as that first use, so a listener registered just before is already listed.

#### Scenario: A held listener is listed

- **WHEN** a bus uses `modulePlugin()`, a caller registers `bus.on("t", fn)`, and then reads `bus.get("t")` with nothing emitted
- **THEN** the array has one listener

#### Scenario: A predicate is listed under any-event

- **WHEN** a bus uses `matchPlugin` and a caller registers a predicate listener
- **THEN** `bus.get("*")` has one more listener, and unbinding it brings it back
