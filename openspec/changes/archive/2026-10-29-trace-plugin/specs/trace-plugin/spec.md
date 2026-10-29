# Spec Delta

## Purpose

Gathers what names and groups the tasks of a trace in one plugin, `tracePlugin` of `nanoeffects/trace`: the `traceGroupId` of a call, the root of an emitter, and a named listener. A bus without the plugin, and a project that turns it off, runs as it does without any of these options.

## ADDED Requirements

### Requirement: tracePlugin is a plugin of the bus
`bus.use(tracePlugin())` from `nanoeffects/trace` SHALL return the same bus. When the bus has no tracer, or the build is `notrace`, it SHALL change nothing on the bus. It SHALL work in any order with the other plugins.

#### Scenario: Same bus
- **WHEN** `const result = bus.use(tracePlugin())`
- **THEN** `result === bus`

#### Scenario: Any order
- **WHEN** `tracePlugin` is used before or after `matchPlugin`, `scopePlugin`, `modulePlugin`, `devPlugin` and the others, in every order of two and in many orders of all
- **THEN** the probes of the plugin pass in each order

### Requirement: The call being emitted is known to the tracer
While `bus.emit` of a bus with a tracer runs, `tracePlugin` SHALL make the call that is emitted known to the tracer, so a task that is made during the emit gets the `traceGroupId` that the call carries in its scope. It SHALL do this for the synchronous time of the emit only, also when a handler throws, and for nested emits in order. It SHALL NOT change what `emit` returns or throws.

#### Scenario: A nested emit
- **WHEN** a listener of a call in group `checkout` emits a call in group `payment`, and then a call with no group
- **THEN** the tasks of the second call have `payment`, and those of the third have `checkout`

#### Scenario: A throwing handler
- **WHEN** a handler throws during an emit
- **THEN** the error reaches the caller as it does without the plugin, and the next emit does not see the old call

### Requirement: A listener can be named when it is registered
With `tracePlugin`, `bus.on(event, handler, { traceId })` and `bus.once(event, handler, { traceId })` SHALL accept an optional third argument. When the bus has a tracer, each call of the listener SHALL be reported as a task of the effect `"run"` whose type is the `traceId`, below the task of the emit, and what the listener emits with `ctx.emit` SHALL be below it. The handler SHALL get the same payload and a context with the same fields.

#### Scenario: The listener that ran is visible
- **WHEN** two listeners of one event are registered with `traceId` `"saveNotifier"` and `"auditLog"` and the event is emitted
- **THEN** the trace has a `run` task for each, named by its `traceId`, and a command that the first one emits is below `saveNotifier`

#### Scenario: Once
- **WHEN** a listener is registered with `bus.once(event, handler, { traceId })`
- **THEN** it runs once and is reported once

### Requirement: A named listener can be removed
`bus.off(event, handler)` SHALL remove the listener that was registered with that handler, with or without a `traceId`, and `bus.off(event)` and `bus.off()` SHALL remove the named ones too.

#### Scenario: Off removes it
- **WHEN** a listener is registered with `{ traceId }` and `bus.off(event, handler)` is called
- **THEN** the event no longer calls it

#### Scenario: Off of all
- **WHEN** named listeners are registered and `bus.off(event)` is called
- **THEN** none of them runs

### Requirement: Nothing breaks when the option is off
Code that passes `traceId` or `traceGroupId` SHALL work the same when `tracePlugin` is not used, when the bus has no tracer, and in the `notrace` build: handlers run as they are, with the same results, throws and rejections, `onError` sees the same errors, and the options are ignored.

#### Scenario: A handler with an option and no plugin
- **WHEN** `bus.on(event, handler, { traceId: "x" })` is called on a bus without the plugin and the event is emitted
- **THEN** the handler runs with the payload and its result and errors are as for `bus.on(event, handler)`

#### Scenario: Errors and rejections with the plugin
- **WHEN** a named listener throws or returns a rejected promise on a bus with a tracer and `onError`
- **THEN** `onError` gets the same error as for an unnamed listener, and the task of the listener is reported as an error

#### Scenario: No tracer
- **WHEN** the plugin is used on a bus that has no tracer and a named listener is registered
- **THEN** the handler runs directly, no task is made, and `off` works

#### Scenario: A failing logger
- **WHEN** a logger of the tracer throws while a named listener runs
- **THEN** the listener still runs and finishes, as the tracer already guarantees

### Requirement: The types do not depend on the plugin
The types of `on`, `once`, `useEmitter` and `bus.emitter` SHALL be the same with and without `tracePlugin`, so a plugin that is used on a condition does not change what compiles. A `traceGroupId` in a scope SHALL never be put on the context.

#### Scenario: A conditional plugin
- **WHEN** code passes `{ traceId }` to `bus.on` and the plugin is used only in development
- **THEN** the code compiles in both builds

### Requirement: The plugin is not in createBus
The code of the plugin, of the root of an emitter and of the named listener SHALL be in the entry `nanoeffects/trace` and not in `createBus`. The size of `createBus` SHALL be no larger than before the change, the entries `react` and `actions` SHALL NOT grow by the root task, and an app that does not use `tracePlugin` SHALL NOT bundle it.

#### Scenario: Sizes
- **WHEN** the sizes are measured
- **THEN** `createBus` is at most 1292 B brotli, `actions` is within 2.86 kB and `react` within the limit of `package.json`, which grows only by the few bytes that read the plugin
