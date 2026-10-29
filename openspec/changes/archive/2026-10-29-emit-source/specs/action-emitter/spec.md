# Spec Delta

## MODIFIED Requirements

### Requirement: The bus gets an emitter for action creators
`emitterPlugin()` from `nanoeffects/actions` SHALL, when used as `bus.use(emitterPlugin())`, add `bus.emitter` to that bus and SHALL return the same bus. `bus.emitter(creator, options?)` SHALL return a function that, when called with arguments, emits `creator(...args)` on that bus with `bus.emit`. The optional `options` SHALL be an object with optional `traceId` and `traceGroupId` strings for the trace (see `emit-origin` and `trace-group`); without a tracer they SHALL have no effect.

#### Scenario: The returned function emits the action
- **WHEN** `const emitNameChanged = bus.emitter(nameChanged)` and a handler listens with `bus.on(nameChanged, fn)`, then `emitNameChanged("Eva")` is called
- **THEN** `fn` receives `"Eva"`

#### Scenario: Usable as a callback
- **WHEN** `emitNameChanged` is passed to a subscription that calls it with a value, such as `$name.listen(emitNameChanged)`
- **THEN** each call emits the action with that value

#### Scenario: Arguments are given to the creator as they are
- **WHEN** the creator has a `prepare` function with several arguments and the emitter is called with them
- **THEN** the emitted payload is what `prepare` returns for those arguments

#### Scenario: Plugin returns the same bus
- **WHEN** `const result = bus.use(emitterPlugin())`
- **THEN** `result === bus`

#### Scenario: A traceId
- **WHEN** `bus.emitter(nameChanged, { traceId: "nameStore" })` is made
- **THEN** the function emits as without `traceId`, and a bus with a tracer shows the `nameStore` root
