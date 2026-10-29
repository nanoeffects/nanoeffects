# Spec Delta

## ADDED Requirements

### Requirement: A named listener works where listeners are made for you
`{ traceId }` SHALL be accepted, and passed on to `bus.on` or `bus.once`, by the `on` of a module, by the `on` and `once` of an instance made by `extendBus` or `@WithBus`, and by `matchPlugin`, so a listener is named wherever it is made.

#### Scenario: A module
- **WHEN** a module calls `m.on(event, handler, { traceId: "moduleListener" })` on a bus with a tracer and `tracePlugin`
- **THEN** each call of the handler is a task named `moduleListener`

#### Scenario: An instance
- **WHEN** an instance made by `extendBus` calls `this.on(event, handler, { traceId: "instanceListener" })`
- **THEN** each call of the handler is a task named `instanceListener`

### Requirement: The build without tracing ignores the options
In the `notrace` build, where the tracing hooks are not built in, `tracePlugin` SHALL change nothing on the bus, `traceId` and `traceGroupId` SHALL be ignored, and handlers, results, throws and `onError` SHALL be as without the plugin.

#### Scenario: The flag is off
- **WHEN** `__NANOEFFECTS_TRACE__` is `false` before the code is imported, the bus has a tracer, and `tracePlugin` is used
- **THEN** `bus.emit`, `bus.on`, `bus.once` and `bus.off` are the same functions as before the plugin, a handler registered with `{ traceId }` runs with its payload, and no event reaches the tracer
