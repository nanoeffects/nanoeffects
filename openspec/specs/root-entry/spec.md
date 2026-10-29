# root-entry Specification

## Purpose
Keeps the root `nanoeffects` entry to `createBus` and the types a person needs to write and use a bus, so the code and the types of plugins, tracing and the internal keys of the library each live in the entry of their own.

## Requirements

### Requirement: The root entry has createBus and no other value
The runtime exports of `nanoeffects` SHALL be `createBus` only. The internal keys `anyEventType` and `commandCall` SHALL NOT be exported from it.

#### Scenario: The runtime exports
- **WHEN** the runtime exports of `nanoeffects` are listed
- **THEN** the list is `createBus`

#### Scenario: An internal key is not importable
- **WHEN** `import { commandCall } from "nanoeffects"` or `import { anyEventType } from "nanoeffects"` is written
- **THEN** it is a type error, and the module has no such export at run time

### Requirement: The root entry exports the types the bus needs
The root entry SHALL keep exporting the types needed to write and use a bus: `Bus`, `BusOptions`, the event, handler, emit and subscribe types, `Context`, `ContextOf`, `ContextOption`, `WithContext`, `WithPayload`, `WithSignal`, `WithType`, `EventMap`, `Keys`, `PayloadOf`, `Task`, `UnsubscribeCallback`, and the command and action types the bus names. A project that imports only these from `nanoeffects` SHALL keep compiling.

#### Scenario: WithSignal comes from the root
- **WHEN** `import type { WithSignal } from "nanoeffects"` is written and a function takes `options: WithSignal`
- **THEN** it accepts `{ signal }`, the context of a task and the context that `race` and `all` give to a starter, and it rejects an object with no `signal` and an object whose `signal` is optional

#### Scenario: A bus is typed from the root
- **WHEN** `import { createBus, type Bus, type WithContext } from "nanoeffects"` is written and a bus is made with an event map and `WithContext`
- **THEN** it type checks, as before

### Requirement: The types of the plugins are in the entries of the plugins
The types of tracing SHALL be exported from `nanoeffects/trace` and not from `nanoeffects`, and `ContextTask` and `NoClash` from `nanoeffects/context` and not from `nanoeffects`.

#### Scenario: A context type from the root
- **WHEN** `import type { NoClash } from "nanoeffects"` is written
- **THEN** it is a type error, and `import type { NoClash } from "nanoeffects/context"` type checks

### Requirement: The declarations of the entries still resolve
Every public type in a signature of the root entry SHALL be reachable by a person who needs to name it, and the built declarations of every entry SHALL resolve without error.

#### Scenario: The package is checked
- **WHEN** `pnpm build` and `pnpm lint:package` run
- **THEN** both pass, and `pnpm consumer-check` type-checks the README example
