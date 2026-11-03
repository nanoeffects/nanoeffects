## MODIFIED Requirements

### Requirement: handle is unchanged
`handle(command, fn)` SHALL keep binding an explicit handler for the life of the module. `handle` SHALL NOT take a list of pairs.

#### Scenario: A contract gets its handler in the module
- **WHEN** a module calls `m.handle(getUser, fn)` for a command made without a handler
- **THEN** `emit(getUser)` runs `fn`

#### Scenario: The list form is a type error
- **WHEN** `m.handle([[getUser, fn]])` is written
- **THEN** it does not type-check
