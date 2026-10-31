## ADDED Requirements

### Requirement: A run of a handler of an action is reported with the effect "action"
When a bus with a tracer runs the handler of an action (its own or one bound in the registry), the trace events of that task SHALL have `effect: "action"`. `EffectName` SHALL include `"action"` and SHALL NOT include `"command"`.

#### Scenario: The effect of a run
- **WHEN** a bus with a tracer emits `getUser("1")` for an action made with a handler
- **THEN** the events of the task have `effect: "action"` with the phases `start` and `done`

#### Scenario: The old name is a type error
- **WHEN** code compares `event.effect === "command"`
- **THEN** it is a type error, because `"command"` is not an `EffectName`
