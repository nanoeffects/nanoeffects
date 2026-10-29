# trace-types Specification

## Purpose
Lets a person who writes a logger or a tracer import the types of tracing from the same entry as `createTracer` and the loggers, `nanoeffects/trace`, and nowhere else. The definitions stay in the core, which the bus needs.

## Requirements

### Requirement: The trace entry exports the types of tracing
`nanoeffects/trace` SHALL export the types `Tracer`, `Trace`, `TraceEvent`, `TraceLogger`, `Phase` and `EffectName`. They SHALL be the types the core defines, so a value of one is a value of the other, and a logger made for `createTracer` SHALL be typed with them, including the type parameter of `Trace`, `TraceEvent` and `TraceLogger`.

#### Scenario: A logger is typed from the trace entry
- **WHEN** `const logger: TraceLogger = (event) => …` is written with `TraceLogger` imported from `nanoeffects/trace`, and it is passed to `createTracer`
- **THEN** it type checks, and `event.phase` is a `Phase`

#### Scenario: The type parameter is kept
- **WHEN** `TraceLogger<{ id: number }>` is written with the type imported from `nanoeffects/trace`
- **THEN** the payload of its event is typed by that parameter

#### Scenario: BusOptions takes a tracer of this type
- **WHEN** `createBus({ trace })` is called with the value of `createTracer(logger)`
- **THEN** it type checks

### Requirement: The root entry does not export the types of tracing
The root entry `nanoeffects` SHALL NOT export `Tracer`, `Trace`, `TraceEvent`, `TraceLogger`, `Phase` or `EffectName`.

#### Scenario: An import from the root is an error
- **WHEN** `import type { TraceLogger } from "nanoeffects"` is written
- **THEN** it is a type error, and the same type is imported from `nanoeffects/trace`

### Requirement: Exporting the types adds no code
The types of tracing SHALL be exported from the trace entry as types only. The runtime exports of `nanoeffects/trace`, and the size of its bundle, SHALL not change.

#### Scenario: The runtime exports are the same
- **WHEN** the runtime exports of `nanoeffects/trace` are listed before and after
- **THEN** the list is the same

### Requirement: The docs take the types from the trace entry
The pages and examples of the documentation SHALL import the types of tracing from `nanoeffects/trace`, next to `createTracer`.

#### Scenario: The logger example
- **WHEN** the custom logger example of the tracing page is read
- **THEN** it imports `TraceLogger` from `nanoeffects/trace`, and `pnpm docs:check` passes
