## MODIFIED Requirements

### Requirement: The root entry exports the types the bus needs
The root entry SHALL keep exporting the types needed to write and use a bus: `Bus`, `BusOptions`, the event, handler, emit and subscribe types, `Context`, `ContextOf`, `ContextOption`, `WithContext`, `WithPayload`, `WithSignal`, `WithType`, `EventMap`, `Keys`, `PayloadOf`, `Task`, `UnsubscribeCallback`, and the command and action types the bus names. A project that imports only these from `nanoeffects` SHALL keep compiling.

#### Scenario: WithSignal comes from the root
- **WHEN** `import type { WithSignal } from "nanoeffects"` is written and a function takes `options: WithSignal`
- **THEN** it accepts `{ signal }`, the context of a task and the context that `race` and `all` give to a starter, and it rejects an object with no `signal` and an object whose `signal` is optional

#### Scenario: A bus is typed from the root
- **WHEN** `import { createBus, type Bus, type WithContext } from "nanoeffects"` is written and a bus is made with an event map and `WithContext`
- **THEN** it type checks, as before
