## MODIFIED Requirements

### Requirement: A traceGroupId is declared in the scope of a call
`createJob` and `createAction` (with or without a handler) SHALL accept `traceGroupId`, a string, in their scope, and `useEmitter` and `bus.emitter` SHALL accept it in their options. A call with a `traceGroupId` SHALL start its task with that `traceGroupId` when `tracePlugin` is used on the bus; without it the `traceGroupId` of a scope SHALL be ignored. A scope with only a `traceGroupId` SHALL be valid, also for an action whose handler is given later.

#### Scenario: A command with a group
- **WHEN** `createAction("checkout/pay", handler, { traceGroupId: "checkout" })` is emitted on a bus with a tracer and `tracePlugin`
- **THEN** the trace events of its task have `traceGroupId: "checkout"`

#### Scenario: An emitter with a group
- **WHEN** `useEmitter(cartChanged, cart, { traceId: "Cart", traceGroupId: "checkout" })` emits
- **THEN** the root task and every task below it have `traceGroupId: "checkout"`

#### Scenario: No plugin
- **WHEN** a bus has a tracer but not `tracePlugin` and a command declares a `traceGroupId` in its scope
- **THEN** the trace events have no `traceGroupId` and the command runs as before
