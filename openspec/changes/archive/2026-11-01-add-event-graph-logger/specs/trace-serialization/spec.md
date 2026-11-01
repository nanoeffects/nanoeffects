## ADDED Requirements

### Requirement: What leaves the process is plain data
The built-in loggers SHALL NOT throw for any payload or error, and what they hand to a tool outside the process SHALL be plain data that `JSON.stringify` takes. `reduxDevtools` SHALL make the payload and the error of each action plain with `safeSerialize` before the extension gets them, except that an `Error` SHALL still be sent as its message; its `serialize` option SHALL replace this with a function, or send values as they are with `false`. `performanceLogger` SHALL send an error as text, also for an object with no prototype or a throwing `toString`. `consoleLogger` SHALL pass the value to the console. `createTraceRecorder` SHALL keep events as they are and SHALL have `toJSON()`, also used by `JSON.stringify(recorder)`, that gives the events as plain data, for a recorder with a capacity too. `graphLogger` SHALL export a payload only when asked, as plain data.

#### Scenario: Hostile values reach Redux DevTools
- **WHEN** a payload and an error are a circular object, a class instance, a `Map`, an `Error` with a `cause`, a bigint, a symbol, a function, a Proxy whose traps throw, an object with no prototype, a 5 000-deep chain or an array of 100 000 items
- **THEN** no logger throws and `JSON.stringify` of everything the extension was sent does not throw

#### Scenario: Performance details
- **WHEN** the same values are errors
- **THEN** the details recorded by `performanceLogger` are plain data

#### Scenario: The recorder
- **WHEN** the same values are payloads
- **THEN** `recorder.events` keeps them as they are, and `JSON.stringify(recorder)` and `recorder.toJSON()` do not throw

#### Scenario: Your own serialize
- **WHEN** `reduxDevtools({ serialize })` is given a function
- **THEN** the payload and the error are what it returns

#### Scenario: No serialize
- **WHEN** `serialize: false` is given
- **THEN** the value reaches the extension as it is

### Requirement: safeSerialize is exported for custom loggers
`nanoeffects/trace` SHALL export `safeSerialize(value, options?)` with the types `JsonValue` and `SerializeOptions`, with the behavior of the serializer of the graph logger.

#### Scenario: A custom logger
- **WHEN** a custom logger calls `safeSerialize` on a circular payload
- **THEN** it gets plain data with `"[Circular]"` where the cycle is
