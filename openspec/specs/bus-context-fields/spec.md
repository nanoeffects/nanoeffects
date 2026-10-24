# bus-context-fields Specification

## Purpose
Lets contextPlugin put typed fields on every task of a bus, so handlers see them with no hand-written WithContext and they merge with the fields of every other source.

## Requirements

### Requirement: contextPlugin puts typed fields on every task
`bus.use(contextPlugin(fields))` SHALL give every task context of that bus the fields of `fields`, and SHALL return the same bus, typed with those fields. The types SHALL be inferred from the value passed, whether or not the bus was made with an event map. `fields` MAY be a function of the task that returns an object.

#### Scenario: An object gives typed fields with an event map
- **WHEN** `const bus = createBus<{ "user/loaded": User }>().use(contextPlugin({ store }))` is written and `store` is a `Store`
- **THEN** a handler of `user/loaded` has `ctx.store` typed as `Store` and its payload typed as `User`, and `ctx.nothing` is a type error

#### Scenario: An object gives typed fields without an event map
- **WHEN** `const bus = createBus().use(contextPlugin({ store }))` is written
- **THEN** a handler has `ctx.store` typed as `Store`

#### Scenario: A function gives typed fields
- **WHEN** `bus.use(contextPlugin((task) => ({ scope: task.type })))` is written
- **THEN** `ctx.scope` is typed as `string` and holds the type of the event of the task

#### Scenario: The fields reach every task
- **WHEN** such a bus runs a handler, a child task made with `ctx.run`, a task of an effect, and a module handler
- **THEN** each of them has the fields

#### Scenario: The plugin returns the bus
- **WHEN** `const result = bus.use(contextPlugin({ store }))`
- **THEN** `result === bus`

### Requirement: Fields merge with every other source
Fields from several `contextPlugin` calls, from the `context` option of `createBus`, from `WithContext` in the event map and from `effectsPlugin` SHALL all be present on the context, and their types SHALL be combined. `EventsOf<typeof bus>` SHALL include all of them.

#### Scenario: Two plugins
- **WHEN** `bus.use(contextPlugin({ store })).use(contextPlugin({ logger }))`
- **THEN** `ctx.store` and `ctx.logger` are both present and typed

#### Scenario: Plugin and the context option
- **WHEN** `createBus<Events>({ context: { store } })` has `store` from `WithContext` in `Events`, and `contextPlugin({ logger })` is used on it
- **THEN** `ctx.store` and `ctx.logger` are both present and typed

#### Scenario: Plugin with effectsPlugin
- **WHEN** `createBus().use(contextPlugin({ store })).use(effectsPlugin({ race }))` is written
- **THEN** `ctx.store` and `ctx.race` are both present and typed, in either order of the two plugins

### Requirement: A name that another source has is rejected
A field of `contextPlugin` with the name of a field that the bus already has from another source SHALL be a type error at the call. At runtime, a field already on the context SHALL NOT be overwritten, and the fields of the library (`signal`, `emit`, `on`, `run`, …) SHALL win over the fields of the plugin.

#### Scenario: A repeated name is a type error
- **WHEN** a bus has `store` from `WithContext` or from an earlier plugin, and `contextPlugin({ store })` is used on it
- **THEN** the call does not type-check

#### Scenario: A library name does not replace the library field
- **WHEN** `contextPlugin({ signal: "x" })` is used
- **THEN** `ctx.signal` is the `AbortSignal` of the task

### Requirement: createBus and WithContext are unchanged
`createBus`, its `context` option and `WithContext` SHALL keep their signatures and behavior, and a bus that does not use `contextPlugin` SHALL be made and typed as before. Code written before this change SHALL keep type-checking and running.

#### Scenario: The old form still types the fields
- **WHEN** `createBus<{ save: Draft } & WithContext<{ store: Store }>>({ context: { store } })` is called
- **THEN** `ctx.store` is typed as `Store`, as before

#### Scenario: No plugin, no change
- **WHEN** `createBus<Events>()` is called and `contextPlugin` is not used
- **THEN** the bus has the type and the runtime behavior it had before
