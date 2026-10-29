## ADDED Requirements

### Requirement: contextPlugin is an entry of its own
`contextPlugin` SHALL be exported from `nanoeffects/context` and SHALL NOT be exported from `nanoeffects`. The types `NoClash` and `ContextTask` SHALL be exported from both entries. The code of the plugin SHALL NOT be in `dist/index.js`.

#### Scenario: Import from the new entry
- **WHEN** `import { contextPlugin } from "nanoeffects/context"` is written and `bus.use(contextPlugin({ store }))` is called
- **THEN** it type-checks and `ctx.store` is typed and present, as before the move

#### Scenario: The old import
- **WHEN** `import { contextPlugin } from "nanoeffects"` is written
- **THEN** it is a type error, and the module has no such export at run time

#### Scenario: The main entry
- **WHEN** `dist/index.js` is read
- **THEN** it contains `createBus` and the exports of the core, and no code of `contextPlugin`

## MODIFIED Requirements

### Requirement: createBus and WithContext are unchanged
`createBus`, its `context` option and `WithContext` SHALL keep their signatures and behavior, and a bus that does not use `contextPlugin` SHALL be made and typed as before. Code written before this change SHALL keep type-checking and running, except that `contextPlugin` is imported from `nanoeffects/context`.

#### Scenario: The old form still types the fields
- **WHEN** `createBus<{ save: Draft } & WithContext<{ store: Store }>>({ context: { store } })` is called
- **THEN** `ctx.store` is typed as `Store`, as before

#### Scenario: No plugin, no change
- **WHEN** `createBus<Events>()` is called and `contextPlugin` is not used
- **THEN** the bus has the type and the runtime behavior it had before
