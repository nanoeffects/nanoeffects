# Spec Delta

## MODIFIED Requirements

### Requirement: contextPlugin is an entry of its own
`contextPlugin` SHALL be exported from `nanoeffects/context` and SHALL NOT be exported from `nanoeffects`. The types `NoClash` and `ContextTask` SHALL be exported from `nanoeffects/context` and SHALL NOT be exported from `nanoeffects`. The code of the plugin SHALL NOT be in `dist/index.js`.

#### Scenario: Import from the new entry
- **WHEN** `import { contextPlugin } from "nanoeffects/context"` is written and `bus.use(contextPlugin({ store }))` is called
- **THEN** it type-checks and `ctx.store` is typed and present, as before the move

#### Scenario: The old import
- **WHEN** `import { contextPlugin } from "nanoeffects"` is written
- **THEN** it is a type error, and the module has no such export at run time

#### Scenario: The types of the plugin
- **WHEN** `import type { NoClash, ContextTask } from "nanoeffects/context"` is written
- **THEN** it type-checks, and the same import from `nanoeffects` is a type error

#### Scenario: The main entry
- **WHEN** `dist/index.js` is read
- **THEN** it contains `createBus` and the exports of the core, and no code of `contextPlugin`
