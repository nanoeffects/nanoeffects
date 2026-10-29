# trace-group Specification

## Purpose
Names a whole flow in a trace. A `traceGroupId` that a command, a job, an action or an emitter declares is passed to every task that it starts, so a reader of the log can follow one flow, such as a checkout, across several roots and branches by one key.

## Requirements

### Requirement: A traceGroupId is declared in the scope of a call
`createCommand`, `createJob` and `createAction` SHALL accept `traceGroupId`, a string, in their scope, and `useEmitter` and `bus.emitter` SHALL accept it in their options. A call with a `traceGroupId` SHALL start its task with that `traceGroupId`. A scope with only a `traceGroupId` SHALL be valid, also for a command whose handler is given later.

#### Scenario: A command with a group
- **WHEN** `createCommand("checkout/pay", handler, { traceGroupId: "checkout" })` is emitted on a bus with a tracer
- **THEN** the trace events of its task have `traceGroupId: "checkout"`

#### Scenario: An emitter with a group
- **WHEN** `useEmitter(cartChanged, cart, { traceId: "Cart", traceGroupId: "checkout" })` emits
- **THEN** the root task and every task below it have `traceGroupId: "checkout"`

### Requirement: Tasks inherit the traceGroupId
A task that a task with a `traceGroupId` starts, through `ctx.emit`, `ctx.run` or a policy or an effect, SHALL have the same `traceGroupId`, however deep. A task that declares its own `traceGroupId` SHALL use it for itself and for the tasks below it, and SHALL NOT change the `traceGroupId` of the task above.

#### Scenario: A chain
- **WHEN** a command with `traceGroupId: "checkout"` emits an event whose listener runs a second command with no `traceGroupId`
- **THEN** the second command's trace events have `traceGroupId: "checkout"`

#### Scenario: A nearer group wins
- **WHEN** a command in group `checkout` emits a command that declares `traceGroupId: "payment"`
- **THEN** the second command and its children have `traceGroupId: "payment"`, and the first command keeps `checkout`

#### Scenario: Another root
- **WHEN** two roots, a click and a timer, declare the same `traceGroupId`
- **THEN** the events of both flows carry the same `traceGroupId`

### Requirement: The trace shows the traceGroupId
A trace event SHALL have an optional `traceGroupId` field that is set when the task or an ancestor has one, and absent otherwise. `consoleLogger` SHALL print it, `performanceLogger` SHALL put `traceGroupId` and `rootId` in the detail of its marks and measures, and `reduxDevtools` SHALL keep them in the actions it sends and `traceGroupId` in the running tasks of its state. The logger contract SHALL stay the same for loggers that ignore the field.

#### Scenario: Console
- **WHEN** a task with `traceGroupId: "checkout"` is traced with `consoleLogger`
- **THEN** its line shows `checkout`

#### Scenario: Performance panel and Redux DevTools
- **WHEN** a task with `traceGroupId: "checkout"` and a `rootId` ends and is traced with `performanceLogger` and with `reduxDevtools`
- **THEN** the detail of the measure has both fields, and the action sent to the extension has both fields

#### Scenario: No group
- **WHEN** no task in the chain has a `traceGroupId`
- **THEN** the events have no `traceGroupId` field and the lines are as before

### Requirement: Events carry the id of the root of their chain
A trace event of a task that has a task above it SHALL have an optional `rootId`: the `id` of the root task of the chain, that is, the task that has no task above it. It SHALL be the same through every hop, also through a listener that reports nothing. The events of a root task SHALL NOT have a `rootId`.

#### Scenario: A command below a listener
- **WHEN** an emitter with `traceId: "Profile"` emits an event, a listener of it emits a command, and the bus has a tracer
- **THEN** the events of the command have `rootId` equal to the `id` of the `Profile` root, although the `parentId` of the command is the listener

#### Scenario: A root
- **WHEN** a task has no task above it
- **THEN** its events have no `rootId`

### Requirement: The traceGroupId is for the tracer, not the context
`traceGroupId` SHALL be a reserved key of a scope: it SHALL NOT be put on the task context, and it SHALL work without `scopePlugin`. Without a tracer it SHALL have no effect.

#### Scenario: Not on the context
- **WHEN** a command has `{ traceGroupId: "checkout" }` in its scope and a handler reads `ctx.traceGroupId`
- **THEN** it is `undefined`

#### Scenario: Without the scope plugin
- **WHEN** the bus has no `scopePlugin` and a command declares a `traceGroupId`
- **THEN** the tracer still reports it

### Requirement: The tracer keeps and inherits the traceGroupId
The inheritance SHALL be done by the tracer from the parent task it is given, not by the bus, so `createBus` SHALL NOT grow.

#### Scenario: Size of createBus
- **WHEN** `createBus` alone is bundled
- **THEN** its size is the same as before the change
