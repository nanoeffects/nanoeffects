# react-entry Specification

## Purpose
Let a React component tell the bus when a value changes, without the mount, StrictMode and dependency traps of a hand-written effect.

## Requirements

### Requirement: The package has a nanoeffects/react entry
The package SHALL export `nanoeffects/react` with types and an ES module build. The entry SHALL export `reactPlugin` and import only `react` besides its own files. No other entry SHALL import `react`, and `react` SHALL be an optional peer dependency, so a project without React installs and runs every other entry.

#### Scenario: A project without React
- **WHEN** a project without React installs `nanoeffects` and imports `nanoeffects` or `nanoeffects/policies`
- **THEN** it installs and runs, and no module of those entries imports `react`

#### Scenario: A project with React
- **WHEN** a React project imports `{ reactPlugin } from "nanoeffects/react"`
- **THEN** it type-checks and bundles with `react` taken from the project, not copied into the bundle

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
- **THEN** it emits as without `traceId`, and a bus with a tracer and `tracePlugin` shows the `Profile` root; without the plugin the option is ignored

### Requirement: useEmitter emits when the value changes
After a render commits with a value that differs from the previous one (by `Object.is`, or by `equals` when it is given), `useEmitter` SHALL emit the event with that value, once. It SHALL NOT emit on mount, SHALL NOT emit twice under StrictMode, and SHALL NOT emit again for a render with an equal value. Several changes before one commit SHALL emit once with the last value. A new `event` or `equals` identity on a later render SHALL NOT cause an emit by itself.

#### Scenario: A change emits once
- **WHEN** a component sets a new value in an event handler, also under StrictMode
- **THEN** the bus emits the event once, with the new value, after the render

#### Scenario: No emit on mount
- **WHEN** a component using the hook mounts, also under StrictMode
- **THEN** nothing is emitted

#### Scenario: An equal value
- **WHEN** the component sets a value equal to the current one
- **THEN** nothing is emitted

#### Scenario: A custom comparison
- **WHEN** `equals` is given and tells that a new object is the same as the previous one
- **THEN** nothing is emitted, and a value that `equals` tells apart emits once

#### Scenario: A string event and an action creator
- **WHEN** the event is a string name, or an action creator
- **THEN** the bus handlers of that event run with the value as payload

### Requirement: The entry has a size budget and passes the gates
The built `nanoeffects/react` SHALL have a `size-limit` item that counts the code without `react`, and the entry SHALL pass `pnpm check`, `pnpm tsgo`, `pnpm lint:package` and `pnpm smoke` (smoke SHALL skip running the plugin where React is not installed).

#### Scenario: Gates
- **WHEN** `pnpm verify` runs
- **THEN** it passes and `pnpm size` reports the entry within its limit

### Requirement: The plugin adds useEventState to the bus
`bus.use(reactPlugin())` SHALL also give the bus `useEventState(event, initial)`. `event` SHALL be an event name of the bus or an action creator, and `initial` SHALL have the payload type of that event, or be a function that returns it. The hook SHALL return `[state, setState]` typed as `useState` of the payload type. The method SHALL be a closure over the bus, so `const { useEventState } = bus` gives a hook that works without the bus around it.

#### Scenario: The hook is exported on its own
- **WHEN** an app writes `export const { useEventState } = bus` and a component calls `useEventState(searchLoaded, [])`
- **THEN** it behaves exactly as `bus.useEventState(searchLoaded, [])`

#### Scenario: The state type comes from the event
- **WHEN** a TypeScript caller passes an `initial` whose type is not the payload of the event
- **THEN** TypeScript rejects the call, and `state` has the payload type otherwise

### Requirement: useEventState takes the state type from initial when the payload is unknown
When the payload type of `event` is `unknown` (the bus has no event map entry for it, or the creator carries no payload type), the state type SHALL be the type of `initial`, widened as `useState` widens it, so a literal `"Adam"` is `string`. An `initial` of `[]` SHALL give `unknown[]`. When the payload type is known, the state type SHALL be that payload type and `initial` of another type SHALL be rejected, as before.

#### Scenario: Unknown payload, typed initial
- **WHEN** a caller uses a creator without a payload type on a bus without an event map and passes `["a"]` as `initial`, or a function that returns it
- **THEN** `state` has the type `string[]`

#### Scenario: Unknown payload, empty array
- **WHEN** the payload type is unknown and `initial` is `[]`
- **THEN** `state` has the type `unknown[]`, not `never[]`

#### Scenario: Known payload
- **WHEN** the payload type is `string` and `initial` is `"Adam"`
- **THEN** `state` has the type `string`, not `"Adam"`, and `initial` of type `number` is rejected

### Requirement: useEventState keeps the last payload as state
The first render SHALL return `initial` (a function is called once, as `useState` does). While the component is mounted, every emit of `event` SHALL set the state to its payload and re-render, also when the payload is a function, which SHALL be stored and not called. An equal payload (`Object.is`) SHALL NOT re-render. `setState` SHALL be the stable function of React: it sets the state without touching the bus.

#### Scenario: An event sets the state
- **WHEN** a mounted component uses `useEventState(searchLoaded, [])` and the bus emits `searchLoaded` with `["a"]`
- **THEN** the component renders again with `state` equal to `["a"]`

#### Scenario: A function payload
- **WHEN** the payload of the event is a function
- **THEN** `state` is that function and it has not been called

#### Scenario: A lazy initial
- **WHEN** `initial` is a function
- **THEN** it is called once, on the first render, and its result is the first `state`

#### Scenario: A local set
- **WHEN** the component calls `setState` with a value
- **THEN** the state changes as with `useState` and nothing is emitted

### Requirement: useEventState subscribes for the life of the component
The hook SHALL subscribe after the first commit and unsubscribe when the component unmounts, so a mounted component holds one listener for `event` and an unmounted one holds none. It SHALL work under StrictMode (the extra mount and unmount leave one listener) and SHALL NOT resubscribe on a render that has the same `event`. An emit before the subscription exists, or after the unmount, SHALL NOT reach the component; the bus keeps no value to replay.

#### Scenario: Unmount
- **WHEN** the component unmounts
- **THEN** the bus has no listener of the hook and a later emit does not touch React

#### Scenario: StrictMode
- **WHEN** the component mounts under StrictMode
- **THEN** one emit of the event sets the state once and the bus has exactly one listener

#### Scenario: A new event
- **WHEN** a later render passes another event
- **THEN** the hook unsubscribes from the old one and subscribes to the new one
