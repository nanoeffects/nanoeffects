## ADDED Requirements

### Requirement: Selected effects are available on every task context
`effectsPlugin(helpers)` from `nanoeffects/effects` SHALL, when used as `bus.use(effectsPlugin(helpers))`, add each passed helper to the context of every task of that bus (including child tasks), bound to that task, and SHALL return the same bus. A bound helper calls the free effect with the task context as the first argument and works when destructured.

#### Scenario: Destructured helper matches the free form
- **WHEN** a handler is `async (id, { race }) => race({ a, b })`
- **THEN** the result and cancellation match `race(ctx, { a, b })`

#### Scenario: Only passed helpers are attached
- **WHEN** `effectsPlugin({ race })` is used
- **THEN** task contexts have `race` and no other plugin-provided effect

#### Scenario: Existing context and library fields are kept
- **WHEN** the bus has `context: { store }` (or a function) and `effectsPlugin({ all })` is used
- **THEN** handlers get `store` and `all`, and `signal`, `emit`, `run` are unchanged

#### Scenario: Child tasks get the helpers
- **WHEN** a handler calls `ctx.run(child)`
- **THEN** the child context has the same helpers, bound to the child

#### Scenario: Plugin returns the same bus
- **WHEN** `const result = bus.use(effectsPlugin({ race }))`
- **THEN** `result === bus`

### Requirement: Bound helpers are typed on the returned bus
`bus.use(effectsPlugin(helpers))` SHALL be typed `Bus<E & WithContext<…>>`, so handlers see the bound helpers (without the `ctx` parameter) with no hand-written `WithContext` for them, and fields accumulate with existing `WithContext` fields.

#### Scenario: Handler sees typed helpers
- **WHEN** `const bus = createBus<{ load: string }>().use(effectsPlugin({ race }))` and `bus.on("load", (id, { race }) => …)`
- **THEN** `race` is typed as `race` without the leading `ctx` argument

#### Scenario: Unsupported helper is rejected
- **WHEN** a helper outside `race`, `all`, `allSettled`, `take`, `delay` is passed
- **THEN** TypeScript reports an error

#### Scenario: A name that is already a context field is rejected
- **WHEN** an effect name is already a context field of the bus (from `WithContext` or an earlier `effectsPlugin`)
- **THEN** TypeScript reports an error on `bus.use(effectsPlugin(…))`
