# Spec Delta

## MODIFIED Requirements

### Requirement: A traceGroupId is declared in the scope of a call
`createCommand`, `createJob` and `createAction` SHALL accept `traceGroupId`, a string, in their scope, and `useEmitter` and `bus.emitter` SHALL accept it in their options. A call with a `traceGroupId` SHALL start its task with that `traceGroupId` when `tracePlugin` is used on the bus; without it the `traceGroupId` of a scope SHALL be ignored. A scope with only a `traceGroupId` SHALL be valid, also for a command whose handler is given later.

#### Scenario: A command with a group
- **WHEN** `createCommand("checkout/pay", handler, { traceGroupId: "checkout" })` is emitted on a bus with a tracer and `tracePlugin`
- **THEN** the trace events of its task have `traceGroupId: "checkout"`

#### Scenario: An emitter with a group
- **WHEN** `useEmitter(cartChanged, cart, { traceId: "Cart", traceGroupId: "checkout" })` emits
- **THEN** the root task and every task below it have `traceGroupId: "checkout"`

#### Scenario: No plugin
- **WHEN** a bus has a tracer but not `tracePlugin` and a command declares a `traceGroupId` in its scope
- **THEN** the trace events have no `traceGroupId` and the command runs as before

### Requirement: The traceGroupId is for the tracer, not the context
`traceGroupId` SHALL be a reserved key of a scope: it SHALL NOT be put on the task context, whether or not `scopePlugin` or `tracePlugin` is used. It SHALL work without `scopePlugin` and SHALL need `tracePlugin`. Without a tracer it SHALL have no effect.

#### Scenario: Not on the context
- **WHEN** a command has `{ traceGroupId: "checkout" }` in its scope and a handler reads `ctx.traceGroupId`
- **THEN** it is `undefined`

#### Scenario: Without the scope plugin
- **WHEN** the bus has no `scopePlugin`, has `tracePlugin` and a command declares a `traceGroupId`
- **THEN** the tracer still reports it

### Requirement: The tracer keeps and inherits the traceGroupId
The inheritance SHALL be done by the tracer from the parent task it is given, not by the bus. The call that is being emitted SHALL reach the tracer through `tracePlugin`, which makes it known for the synchronous time of the emit, and not through the bus, so `createBus` SHALL NOT grow and `Tracer.task` SHALL keep its signature.

#### Scenario: Size of createBus
- **WHEN** `createBus` alone is bundled
- **THEN** its size is the same as before the change
