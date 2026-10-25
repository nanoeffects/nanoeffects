## ADDED Requirements

### Requirement: effectsPlugin does not replace a field that is there
`effectsPlugin` SHALL NOT assign an effect to a context that already has a field of that name, so a field put there by `scopePlugin` or another source stays, whatever the order of the plugins.

#### Scenario: A field already on the context stays
- **WHEN** a context has `delay` when `effectsPlugin({ delay })` fills it
- **THEN** `ctx.delay` is the earlier value

#### Scenario: A child task has effects bound to itself
- **WHEN** a handler calls `ctx.run(child)` on a bus with `effectsPlugin({ delay })`
- **THEN** the `delay` of the child is aborted with the child, not only with its parent
