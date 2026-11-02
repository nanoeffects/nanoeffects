# Spec Delta

## ADDED Requirements

### Requirement: describeBus can add the source
`describeBus(bus, { source: true })` SHALL append ` (file:line:column)` to the name of each listener that was registered with `tracePlugin({ source: true })`, as `"saveName (src/user.ts:12:5)"`. A listener with no recorded source SHALL keep its plain name. Without the option the result SHALL be as before.

#### Scenario: With and without the option
- **WHEN** `saveName` was registered at `src/user.ts:12:5` with the source on
- **THEN** `describeBus(bus)` lists `"saveName"` and `describeBus(bus, { source: true })` lists `"saveName (src/user.ts:12:5)"`
