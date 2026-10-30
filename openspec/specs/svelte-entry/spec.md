# svelte-entry Specification

## Purpose
TBD - created by archiving change add-svelte-plugin. Update Purpose after archive.

## Requirements

### Requirement: The package has a nanoeffects/svelte entry
The package SHALL export `nanoeffects/svelte` with types and an ES module build. The entry SHALL export `sveltePlugin` and import only `svelte/store` besides its own files. No other entry SHALL import `svelte`, and `svelte` SHALL be an optional peer dependency, so a project without Svelte installs and runs every other entry.

#### Scenario: A project without Svelte
- **WHEN** a project without Svelte installs `nanoeffects` and imports `nanoeffects` or `nanoeffects/policies`
- **THEN** it installs and runs, and no module of those entries imports `svelte`

#### Scenario: A project with Svelte
- **WHEN** a Svelte project imports `{ sveltePlugin } from "nanoeffects/svelte"`
- **THEN** it type-checks and bundles with `svelte` taken from the project, not copied into the bundle

### Requirement: The plugin adds eventStore to the bus
`bus.use(sveltePlugin())` SHALL return the same bus, typed with one more method, `eventStore(event, initial)`. `event` SHALL be an event name of the bus or an action creator. The method SHALL be a closure over the bus, so `const { eventStore } = bus` gives a function that works without the bus around it.

#### Scenario: The method is exported on its own
- **WHEN** an app writes `export const { eventStore } = bus`
- **THEN** it behaves exactly as the method of the bus

### Requirement: eventStore is a readable store of an event
`eventStore(event, initial)` SHALL return a Svelte readable store. Its value SHALL be `initial` until `event` is emitted and the payload of the latest emit after that. The store SHALL listen to the bus from the first subscription to the last unsubscription and SHALL NOT listen while nothing subscribes. A function payload SHALL be stored as it is, not called. The type of the value SHALL come from the event, or from `initial` when the event has no payload type, and a wrong `initial` SHALL be a type error.

#### Scenario: The value follows the event
- **WHEN** a component subscribes to `eventStore(searchLoaded, [])` and the bus emits `searchLoaded(["a"])`
- **THEN** the subscriber is called with `["a"]`

#### Scenario: Listening only while read
- **WHEN** nothing subscribes to the store
- **THEN** the bus has no listener of the store, and it has one after the first subscription and none after the last unsubscription

#### Scenario: An event while nothing reads is lost
- **WHEN** the event is emitted while the store has no subscriber and a component subscribes afterwards
- **THEN** the subscriber is called with `initial`, not with that payload

#### Scenario: A function payload is stored
- **WHEN** the payload of the event is a function
- **THEN** the store holds that function and does not call it

#### Scenario: The type comes from the event
- **WHEN** an app writes `eventStore(searchLoaded, [])` and `searchLoaded` is `createAction<string[]>("search/loaded")`
- **THEN** the value of the store has the type `string[]`

### Requirement: The plugin works in any order with the other plugins
`sveltePlugin()` SHALL do no work when it is used that a later plugin could miss, and SHALL NOT replace what another plugin put on the bus, so it works with every other plugin in any order.

#### Scenario: Any order
- **WHEN** `sveltePlugin()` is used before or after the other plugins in the plugin matrix test
- **THEN** `eventStore` is on the bus and its probe passes
