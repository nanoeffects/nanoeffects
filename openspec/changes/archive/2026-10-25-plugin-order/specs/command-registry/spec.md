## REMOVED Requirements

### Requirement: A later registry replaces the earlier one
**Reason**: Replacing the registry lost the handlers that `modulePlugin` and earlier `commandsPlugin` calls had bound, so `commandsPlugin` had to be used before `modulePlugin`. A later call merges instead.
**Migration**: Code that relied on the replacement to drop the earlier handlers unbinds them with the function `handle` returned, or sets `bus.commands = { run }`.

## ADDED Requirements

### Requirement: A later commandsPlugin merges into the registry
When the bus already has a registry made by `commandsPlugin` or by `modulePlugin`, `bus.use(commandsPlugin(bindings))` SHALL bind `bindings` in that registry and return that same registry; the handlers bound earlier SHALL keep running. A `commands` that is not such a registry (a custom runner `{ run }`) SHALL be replaced as before.

#### Scenario: Two uses share one registry
- **WHEN** `bus.use(commandsPlugin())` is called twice and a handler was bound in the first
- **THEN** both calls return the same registry and `emit` runs the handler of the first

#### Scenario: After the module plugin
- **WHEN** `bus.use(modulePlugin([userModule]))` and then `bus.use(commandsPlugin([binding]))` are called
- **THEN** the handlers the module binds and `binding` both run, and `app.commands` is that registry

#### Scenario: A custom runner is replaced
- **WHEN** `bus.commands = { run }` is set and then `bus.use(commandsPlugin())` is called
- **THEN** the bus runs the new registry
