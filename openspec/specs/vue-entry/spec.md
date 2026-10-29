# vue-entry Specification

## Purpose
Let a Vue component tell the bus when a value changes, and keep an event of the bus in a ref, without a hand-written watch or subscription.

## Requirements

### Requirement: The package has a nanoeffects/vue entry
The package SHALL export `nanoeffects/vue` with types and an ES module build. The entry SHALL export `vuePlugin` and import only `vue` besides its own files. No other entry SHALL import `vue`, and `vue` SHALL be an optional peer dependency, so a project without Vue installs and runs every other entry.

#### Scenario: A project without Vue
- **WHEN** a project without Vue installs `nanoeffects` and imports `nanoeffects` or `nanoeffects/policies`
- **THEN** it installs and runs, and no module of those entries imports `vue`

#### Scenario: A project with Vue
- **WHEN** a Vue project imports `{ vuePlugin } from "nanoeffects/vue"`
- **THEN** it type-checks and bundles with `vue` taken from the project, not copied into the bundle

### Requirement: The plugin adds watchEmitter and useEventRef to the bus
`bus.use(vuePlugin())` SHALL return the same bus, typed with two more methods, `watchEmitter(source, event, options?)` and `useEventRef(event, initial)`. `event` SHALL be an event name of the bus or an action creator. The methods SHALL be closures over the bus, so `const { watchEmitter, useEventRef } = bus` gives functions that work without the bus around them.

#### Scenario: The methods are exported on their own
- **WHEN** an app writes `export const { watchEmitter, useEventRef } = bus`
- **THEN** each behaves exactly as the method of the bus

### Requirement: watchEmitter emits when the watched value changes
`watchEmitter(source, event, options?)` SHALL take a `ref` or a getter and SHALL emit `event` with the new value after the value changes, once for each change that is seen. It SHALL NOT emit when it is called, and SHALL stop when the scope that made it ends. The value SHALL have the payload type of the event, or a wrong type is a type error.

#### Scenario: A change emits once
- **WHEN** a component sets `query.value = "a"` and the render updates
- **THEN** the bus emits the event once, with `"a"`

#### Scenario: Nothing on mount
- **WHEN** a component calls `watchEmitter(query, queryChanged)` and sets nothing
- **THEN** nothing is emitted

#### Scenario: Stopped with the scope
- **WHEN** the scope that called `watchEmitter` is stopped and the value changes
- **THEN** nothing is emitted

### Requirement: watchEmitter takes options for equality and the trace
The optional `options` of `watchEmitter` SHALL have `equals(previous, next)`, `traceId` and `traceGroupId`. `equals` SHALL decide that two values are the same, and then nothing is emitted. `traceId` and `traceGroupId` SHALL name the subscription and the flow in the trace as for `useEmitter`, and SHALL be ignored without a tracer and `tracePlugin`.

#### Scenario: An equal value
- **WHEN** `equals` says that the new value is the same as the previous one
- **THEN** nothing is emitted

#### Scenario: A trace name
- **WHEN** `traceId` is given on a bus with a tracer and `tracePlugin`
- **THEN** the trace shows the root with that name, and without the plugin the option is ignored

### Requirement: useEventRef keeps the last payload as a ref
`useEventRef(event, initial)` SHALL return a ref whose value is `initial` at first and, after every emit of `event` while its scope lives, the payload of that emit, also when the payload is a function, which SHALL be stored and not called. The ref SHALL stop listening when the scope ends. An emit before the call, or after the scope ended, SHALL NOT reach the ref.

#### Scenario: An event sets the ref
- **WHEN** `const found = useEventRef(searchLoaded, [])` is called and the bus emits `searchLoaded(["a"])`
- **THEN** `found.value` is `["a"]`

#### Scenario: A function payload
- **WHEN** the payload of the event is a function
- **THEN** `ref.value` is that function and it has not been called

#### Scenario: Stopped with the scope
- **WHEN** the scope ends and the bus emits the event
- **THEN** the ref keeps its last value and the bus has no listener of the ref

### Requirement: The type of the ref comes from the event
The type of the ref SHALL be the payload type of the event, or the type of `initial` when the event has no payload type. An `initial` of another type SHALL be rejected when the payload type is known.

#### Scenario: The type comes from the event
- **WHEN** the event is `createAction<string[]>("search/loaded")` and `initial` is `[]`
- **THEN** the ref has the type `Ref<string[]>`

#### Scenario: A wrong initial
- **WHEN** the payload type is `string` and `initial` is `1`
- **THEN** TypeScript rejects the call

### Requirement: The entry has a size budget and passes the gates
The built `nanoeffects/vue` SHALL have a `size-limit` item that counts the code without `vue`, and the entry SHALL pass `pnpm check`, `pnpm tsgo`, `pnpm lint:package` and `pnpm smoke` (smoke SHALL skip running the plugin where Vue is not installed).

#### Scenario: Gates
- **WHEN** `pnpm verify` runs
- **THEN** it passes and `pnpm size` reports the entry within its limit
