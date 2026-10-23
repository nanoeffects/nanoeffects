## Purpose
Let a React component tell the bus when a value changes, without the mount, StrictMode and dependency traps of a hand-written effect.

## ADDED Requirements

### Requirement: The package has a nanoeffects/react entry
The package SHALL export `nanoeffects/react` with types and an ES module build. The entry SHALL export `reactPlugin` and import only `react` besides its own files. No other entry SHALL import `react`, and `react` SHALL be an optional peer dependency, so a project without React installs and runs every other entry.

#### Scenario: A project without React
- **WHEN** a project without React installs `nanoeffects` and imports `nanoeffects` or `nanoeffects/policies`
- **THEN** it installs and runs, and no module of those entries imports `react`

#### Scenario: A project with React
- **WHEN** a React project imports `{ reactPlugin } from "nanoeffects/react"`
- **THEN** it type-checks and bundles with `react` taken from the project, not copied into the bundle

### Requirement: The plugin adds useEmitter to the bus
`bus.use(reactPlugin())` SHALL return the same bus, typed with one more method, `useEmitter(event, value, equals?)`. `event` SHALL be an event name of the bus or an action creator, `value` SHALL have the payload type of that event, and the optional `equals(previous, next)` SHALL take two values of that type. The method SHALL be a closure over the bus, so `const { useEmitter } = bus` gives a hook that works without the bus around it.

#### Scenario: The hook is exported on its own
- **WHEN** an app writes `export const { useEmitter } = bus` and a component calls `useEmitter(nameChanged, name)`
- **THEN** it behaves exactly as `bus.useEmitter(nameChanged, name)`

#### Scenario: A wrong payload type
- **WHEN** a TypeScript caller passes a value whose type is not the payload of the event
- **THEN** TypeScript rejects the call

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
