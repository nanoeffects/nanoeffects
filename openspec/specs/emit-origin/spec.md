# emit-origin Specification

## Purpose
Makes the first link of a trace chain readable. An event that `useEmitter` or `bus.emitter` puts on the bus from outside a task starts a root task that carries a `traceId`, so the tasks it starts are its children and the trace says which subscription began the chain.

## Requirements

### Requirement: An emitter starts a root task when the bus traces
When the bus has a tracer and `tracePlugin` is used on it, `useEmitter` and a function made by `bus.emitter` SHALL emit the event from a root task whose reports have the existing effect `"run"`. The task SHALL be reported as started before the event is emitted and as done after the synchronous emit returns, or as an error when it throws. Every task that the emit starts SHALL be below this task: a command that is emitted directly has it as its `parentId`, and a task below a listener has the task of the listener in between.

#### Scenario: A chain has a root
- **WHEN** a bus with a tracer and `tracePlugin` has `useEmitter(nameChanged, name, { traceId: "Profile" })` in a component, a command listens to `nameChanged`, and the name changes
- **THEN** the trace has a task with the effect `run` and the type `Profile`, and the task of the command is below it

#### Scenario: A callback of a state manager
- **WHEN** `$name.listen(bus.emitter(nameChanged, { traceId: "nameStore" }))` is set up and the store calls the callback
- **THEN** the trace has a `run` task with the type `nameStore`, and the tasks that the event starts are its children

### Requirement: The traceId names the root
`traceId` SHALL be an optional string. When it is given, the type of the root task SHALL be the `traceId`. When it is not, the type SHALL be the type of the event. The payload of the root task SHALL be the action that is emitted.

#### Scenario: No traceId
- **WHEN** an emitter is used without `traceId` on a bus with a tracer
- **THEN** the root task is traced with the type of the event, so a chain still has a root

### Requirement: Nothing extra runs without a tracer
Without a tracer on the bus, or without `tracePlugin` used on it, `useEmitter` and `bus.emitter` SHALL emit with `bus.emit` as they did before and SHALL NOT create a task. `traceId` and `traceGroupId` SHALL have no effect then.

#### Scenario: No tracer
- **WHEN** a bus is made without `trace` and an emitter with `traceId` is used
- **THEN** the listeners run as before and no task is created for the emit

#### Scenario: No plugin
- **WHEN** a bus has a tracer but `tracePlugin` is not used and an emitter with `traceId` is used
- **THEN** the listeners run as before, the options are ignored and no root task is made

### Requirement: The root is made by one helper outside the bus
`tracePlugin` SHALL make the root task for both emitters, through a function that it puts on the bus under a key shared by import (`Symbol.for`), and `useEmitter` and `bus.emitter` SHALL read that key each time they emit and fall back to `bus.emit` when it is absent, so a plugin that is used later is seen and the entries `react` and `actions` do not bundle the root task. The change SHALL NOT add an `EffectName`.

#### Scenario: Size of createBus
- **WHEN** `createBus` alone is bundled
- **THEN** its size is the same as before the change

#### Scenario: The entries do not carry the root task
- **WHEN** an app imports `reactPlugin` or `emitterPlugin` but not `tracePlugin` and is bundled
- **THEN** the code that makes the root task is not in the output
