# Spec Delta

## Purpose

Defines what `createTraceRecorder` keeps and in which order, so the same logger serves a test (every event) and a running app (the last events before an incident).

## ADDED Requirements

### Requirement: Without a capacity the recorder keeps every event
`createTraceRecorder()` with no `capacity`, or with a `capacity` that is not a positive integer, SHALL keep every event it receives, oldest first, and `recorder.events` SHALL be the same array object on every read, including after `clear()`.

#### Scenario: Events are kept in order
- **WHEN** a recorder with no options receives a `start` and then a `done` event
- **THEN** `recorder.events` lists `start` and then `done`

#### Scenario: clear empties the same array
- **WHEN** `const { events } = recorder` is read, then `recorder.clear()` is called
- **THEN** `events` is empty and `recorder.events` is that same array

#### Scenario: A capacity that is not a positive integer is ignored
- **WHEN** a recorder is made with `capacity` of `0`, `-1`, `1.5`, `NaN` or `null`
- **THEN** it keeps every event it receives

### Requirement: A capacity keeps the last events
`createTraceRecorder({ capacity })` with a positive integer `capacity` SHALL keep at most `capacity` events: the latest ones, listed oldest first. An event that does not fit SHALL push out the oldest one.

#### Scenario: Under the capacity
- **WHEN** a recorder with `capacity` of 3 receives 2 events
- **THEN** `recorder.events` lists both, in the order received

#### Scenario: Past the capacity
- **WHEN** a recorder with `capacity` of 3 receives the events `a`, `b`, `c`, `d`, `e`
- **THEN** `recorder.events` lists `c`, `d`, `e`

#### Scenario: Order after several turns
- **WHEN** a recorder with `capacity` of 3 receives 10 events numbered 1 to 10
- **THEN** `recorder.events` lists 8, 9, 10

#### Scenario: A capacity of one
- **WHEN** a recorder with `capacity` of 1 receives two events
- **THEN** `recorder.events` lists only the second

### Requirement: Reading a bounded recorder does not change it
With a `capacity`, `recorder.events` SHALL return a new array that the caller may keep or change, and reading it SHALL NOT change what the recorder holds or the order of later reads.

#### Scenario: A kept array is a snapshot
- **WHEN** `const snapshot = recorder.events` is read, and then another event is recorded
- **THEN** `snapshot` has not changed and `recorder.events` lists the new event

#### Scenario: Changing a read array
- **WHEN** the array read from `recorder.events` is emptied by the caller
- **THEN** the next read of `recorder.events` still lists the events the recorder holds

### Requirement: clear empties a bounded recorder
`recorder.clear()` SHALL make `recorder.events` empty for a recorder with a `capacity`, and the recorder SHALL then record from the start, in order, up to its `capacity`.

#### Scenario: Records again after clear
- **WHEN** a recorder with `capacity` of 2 has wrapped, is cleared, and receives one event
- **THEN** `recorder.events` lists only that event

### Requirement: The recorder is a logger
A recorder SHALL be a `TraceLogger`: it SHALL work wherever a logger does, including in an array of loggers given to `createTracer`, and SHALL NOT throw for any event. A recorder SHALL NOT change an event or add a field to it.

#### Scenario: Recording a real bus
- **WHEN** a bus is made with `createTracer(recorder)` and a handler runs and finishes
- **THEN** `recorder.events` lists its `start` and `done` events, the same objects the tracer made

#### Scenario: A bounded recorder on a real bus
- **WHEN** a bus is made with `createTracer(createTraceRecorder({ capacity: 2 }))` and one handler call produces three events
- **THEN** the recorder lists only the last two
