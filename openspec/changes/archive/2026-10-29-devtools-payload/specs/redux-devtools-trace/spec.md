## ADDED Requirements

### Requirement: The payload is sent where it helps
`reduxDevtools` SHALL take an option `payload`: `"all"`, `"essential"` or `"none"`, `"essential"` by default. With `"all"`, every action SHALL carry the `payload` of its event. With `"none"`, no action SHALL have a `payload` field. With `"essential"`, the emit actions and the actions of the phases `cancel`, `drop` and `error` SHALL carry it, and the actions of `start` and `done` SHALL NOT.

#### Scenario: Default
- **WHEN** `search` is emitted with `{ query: "nano" }`, a `latest` handler runs, and `policies: true, starts: true` with no `payload` option
- **THEN** the emit action has `payload: { query: "nano" }`, and the `start` and `done` actions of the stage have no `payload` field

#### Scenario: A lost call keeps its payload
- **WHEN** a newer emit cancels a `latest` call, and `policies` shows `cancel`
- **THEN** the `cancel` action has the payload of the call that was cancelled

#### Scenario: A failure keeps its payload
- **WHEN** a handler fails with the default `payload`
- **THEN** its `error` action has both `payload` and `error`

#### Scenario: All
- **WHEN** the same flow runs with `payload: "all"`
- **THEN** every action has a `payload`

#### Scenario: None
- **WHEN** the same flow runs with `payload: "none"`
- **THEN** the extension receives the same actions with the same `type`, `id`, `phase` and `effect`, and none has a `payload` field, also not the `cancel` and `error` ones

### Requirement: The payload option changes nothing else
The option `payload` SHALL NOT change which actions are sent, nor `type`, `event`, `id`, `parentId`, `rootId`, `effect`, `phase`, `traceGroupId`, `error`, or the state.

#### Scenario: Same actions
- **WHEN** one flow runs with `"all"`, `"essential"` and `"none"`
- **THEN** the three runs send the same actions in the same order, with the same fields but `payload`

#### Scenario: Not serializable payload
- **WHEN** the payload is a circular object and `payload` is `"none"`
- **THEN** every action serializes with `JSON.stringify`
