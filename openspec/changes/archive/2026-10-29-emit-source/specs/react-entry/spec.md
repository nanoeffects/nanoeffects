# Spec Delta

## MODIFIED Requirements

### Requirement: The plugin adds useEmitter to the bus
`bus.use(reactPlugin())` SHALL return the same bus, typed with one more method, `useEmitter(event, value, options?)`. `event` SHALL be an event name of the bus or an action creator, `value` SHALL have the payload type of that event, and the optional `options` SHALL be an object with three optional fields: `equals(previous, next)`, which takes two values of that type, `traceId`, a string that names the subscription in the trace, and `traceGroupId`, a string that names the flow (see `emit-origin` and `trace-group`). The third argument SHALL NOT be accepted as a function. The method SHALL be a closure over the bus, so `const { useEmitter } = bus` gives a hook that works without the bus around it.

#### Scenario: The hook is exported on its own
- **WHEN** an app writes `export const { useEmitter } = bus` and a component calls `useEmitter(nameChanged, name)`
- **THEN** it behaves exactly as `bus.useEmitter(nameChanged, name)`

#### Scenario: A wrong payload type
- **WHEN** a TypeScript caller passes a value whose type is not the payload of the event
- **THEN** TypeScript rejects the call

#### Scenario: A function as the third argument
- **WHEN** a TypeScript caller passes a function as the third argument
- **THEN** TypeScript rejects the call, and `equals` is given as `{ equals }`

#### Scenario: A traceId
- **WHEN** a component calls `useEmitter(nameChanged, name, { traceId: "Profile" })`
- **THEN** it emits as without `traceId`, and a bus with a tracer shows the `Profile` root
