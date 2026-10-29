# Spec Delta

## MODIFIED Requirements

### Requirement: The middleware is made from a bus
`createEffectsMiddleware(bus, options?)` SHALL take an existing bus as its first argument and return a Redux middleware for that bus. It SHALL NOT create a bus, and it SHALL NOT change what the bus does for events that do not come from Redux. `options` MAY have `traceId` and `traceGroupId`, strings for the trace (see `trace-plugin`): with `tracePlugin` used on a bus that has a tracer, each action SHALL be sent to the bus from a root task named by `traceId`, or by the type of the action when there is none, in the group `traceGroupId`. Without the plugin or a tracer the options SHALL be ignored and the action sent as before.

#### Scenario: Actions of the store reach the bus
- **WHEN** a store is created with the middleware of a bus, a handler is bound to `user/requested` on that bus, and `store.dispatch({ type: "user/requested", payload: "7" })` runs
- **THEN** the handler receives `"7"` after the reducers have handled the action

#### Scenario: The same bus serves the app
- **WHEN** a handler is bound to the bus and `bus.emit("user/requested", "7")` is called without Redux
- **THEN** the handler runs as it does for any bus

#### Scenario: A dispatch has a named root
- **WHEN** the bus has a tracer and `tracePlugin`, the middleware is made with `{ traceId: "store", traceGroupId: "checkout" }`, and an action is dispatched that a command listens to
- **THEN** the trace has a root task named `store` in the group `checkout`, and the task of the command is below it

#### Scenario: No plugin
- **WHEN** the same middleware is used on a bus without `tracePlugin`
- **THEN** the handler receives the action as before and the options are ignored
