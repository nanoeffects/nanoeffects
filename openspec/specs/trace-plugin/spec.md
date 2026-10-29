# trace-plugin Specification

## Purpose
Gathers what names and groups the tasks of a trace in one plugin, `tracePlugin` of `nanoeffects/trace`: the `traceGroupId` of a call, the root of an emitter, and a named listener. A bus without the plugin, and a project that turns it off, runs as it does without any of these options.

## Requirements

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
