## MODIFIED Requirements

### Requirement: Bound helpers are typed on the returned bus
`bus.use(effectsPlugin(helpers))` SHALL be typed `Bus<E & WithContext<…>>`, so handlers see the bound helpers (without the `ctx` parameter) with no hand-written `WithContext` for them, and fields accumulate with existing `WithContext` fields.

#### Scenario: Handler sees typed helpers
- **WHEN** `const bus = createBus<{ load: string }>().use(effectsPlugin({ race }))` and `bus.on("load", (id, { race }) => …)`
- **THEN** `race` is typed as `race` without the leading `ctx` argument

#### Scenario: Unsupported helper is rejected
- **WHEN** a function whose first parameter cannot accept `{ signal }` is passed (any function that takes a signal first is supported, not only `race`, `all`, `allSettled`, `take` and `delay`)
- **THEN** TypeScript reports an error

#### Scenario: A name that is already a context field is rejected
- **WHEN** an effect name is already a context field of the bus (from `WithContext` or an earlier `effectsPlugin`)
- **THEN** TypeScript reports an error on `bus.use(effectsPlugin(…))`
