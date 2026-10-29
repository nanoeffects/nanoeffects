# redux-devtools-trace Specification

## Purpose
What `reduxDevtools` of `nanoeffects/trace` sends to the Redux DevTools extension: by default one action per emit and the failures of handlers, then the stages of the handler tasks and the effects below them when the reader asks for them, and the running tasks as the state.

## Requirements

### Requirement: The default output is one action per emit
`reduxDevtools` SHALL send, by default, one action for each `emit` event of the trace (see `trace-plugin`), in the order they come. Its `type` SHALL be the event name, with `payload`, `id`, `parentId` (when set) and `effect: "emit"` kept. Tasks of handlers, policies and effects SHALL NOT be sent by default. An `emit` action SHALL NOT be in the running state and SHALL NOT depend on `policies`, `starts` or `depth`.

#### Scenario: Two emits, no options
- **WHEN** `search` is emitted twice on a bus with `tracePlugin`, a `latest` handler listens to it, and the bus is traced with `reduxDevtools({ extension })`
- **THEN** the extension receives two actions of type `search`, with the two payloads, and no `search/latest/...` action

#### Scenario: An emit without listeners, or with a plain listener
- **WHEN** an event is emitted that has no listener, or only a plain function
- **THEN** its action is still sent

#### Scenario: Without tracePlugin
- **WHEN** the bus has no `tracePlugin`
- **THEN** no emit action is sent, and the stages that `policies` asks for are still sent

### Requirement: Policy stages are opt-in
The option `policies` SHALL add the stages of the handler tasks (the first tasks of a listener: the policy tasks, and `run` of a handler that calls `ctx.run`) as actions `event/policy/phase`, with the `parentId` the trace gives them. `true` SHALL send every phase; an array SHALL send only the listed phases (`start`, `done`, `error`, `cancel`, `drop`); a function SHALL receive `{ effect, phase }` and send the stage when it returns true. Without `policies`, no such action SHALL be sent.

#### Scenario: Only the cancelled and dropped calls
- **WHEN** `policies: ["cancel", "drop"]` is set and a `latest` handler call is cancelled by a newer emit
- **THEN** the extension receives the emit actions and one `search/latest/cancel` action, and no `start` or `done` action of the handler

#### Scenario: A function
- **WHEN** `policies` is `({ effect, phase }) => effect === "latest" && phase !== "start"`
- **THEN** only the `latest` stages that are not `start` are sent

### Requirement: Errors are always shown
A handler task (the first tasks of a listener) that ends with `error` SHALL be sent, whatever `policies` is (also when `policies` is absent, an empty array, or a function that returns false), with the `error` field of the action as before. The attempts of an effect below it (`retry`) follow `depth`.

#### Scenario: Failing handler, default options
- **WHEN** a handler rejects and the logger has no `policies`
- **THEN** the extension receives the emit action and the action of the error, with the message

### Requirement: Effects keep `starts` and `depth`
Tasks of effects below a handler (`retry`, `timeout`, `poll`, ...) SHALL be sent only when `depth` allows their level, with `starts` deciding whether their start is sent too, as before. Their default SHALL send nothing, so the default output is the emits (and errors) only.

#### Scenario: Retry with depth
- **WHEN** a handler uses `retry` and the logger has `depth: 1`
- **THEN** the actions of `retry` appear, and without `depth` they do not

### Requirement: The running state stays
The state sent with each action SHALL stay `{ running }`, a map by trace id of the tasks that started and have not settled, holding only tasks that the options show. The initial state SHALL be `{ running: {} }`, and `traceGroupId` and `rootId` SHALL stay in the actions that are sent.

#### Scenario: State with policies
- **WHEN** `policies: true`, `starts: true`, and a `latest` call is running
- **THEN** the state sent with the next action lists that call under `running`

### Requirement: A missing plugin is reported once
When a handler task (the first tasks of a listener) ends and the logger has seen no `emit` event before it, `reduxDevtools` SHALL print one `console.warn` that names `tracePlugin`, and no more for the life of the logger. It SHALL NOT warn when an emit came first, or when only a task below a handler ends. The warning SHALL NOT change what is sent.

#### Scenario: No plugin
- **WHEN** a handler task ends on a bus traced by `reduxDevtools` without `tracePlugin`, and again later
- **THEN** one warning is printed that names `tracePlugin`

#### Scenario: With the plugin
- **WHEN** the bus has `tracePlugin` and a handler task ends
- **THEN** no warning is printed

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
