## MODIFIED Requirements

### Requirement: The root entry has createBus and no other value
The runtime exports of `nanoeffects` SHALL be `createBus` only. The internal keys of the library (the plugin keys, among them the key that brands a call of an action with a handler) SHALL NOT be exported from it.

#### Scenario: The runtime exports
- **WHEN** the runtime exports of `nanoeffects` are listed
- **THEN** the list is `createBus`

#### Scenario: An internal key is not importable
- **WHEN** `import { anyEventType } from "nanoeffects"` is written
- **THEN** it is a type error, and the module has no such export at run time

### Requirement: The root entry exports the types the bus needs
The root entry SHALL keep exporting the types needed to write and use a bus: `Bus`, `BusOptions`, the event, handler, emit and subscribe types, `Context`, `ContextOf`, `ContextOption`, `WithContext`, `WithPayload`, `WithSignal`, `WithType`, `EventMap`, `Keys`, `PayloadOf`, `Task`, `UnsubscribeCallback`, and the types of actions the bus names, among them `Handled` (an action with a handler) and `HandledCall` (what calling it returns). It SHALL NOT export `Command` or `CommandCall`. A project that imports only these from `nanoeffects` SHALL keep compiling.

#### Scenario: WithSignal comes from the root
- **WHEN** `import type { WithSignal } from "nanoeffects"` is written and a function takes `options: WithSignal`
- **THEN** it accepts `{ signal }`, the context of a task and the context that `race` and `all` give to a starter, and it rejects an object with no `signal` and an object whose `signal` is optional

#### Scenario: A bus is typed from the root
- **WHEN** `import { createBus, type Bus, type WithContext } from "nanoeffects"` is written and a bus is made with an event map and `WithContext`
- **THEN** it type checks, as before

#### Scenario: The old names are gone
- **WHEN** `import type { Command } from "nanoeffects"` is written
- **THEN** it is a type error, and `Handled` is imported instead
