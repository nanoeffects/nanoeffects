# Spec Delta

## Purpose

Defines one-shot bus listeners (`once`) and clearing every subscription at once (`off()` with no arguments), including interaction with per-event `off` and the `"*"` listener.

## ADDED Requirements

### Requirement: One-shot listener via once

The bus SHALL provide `once(event, fn)` that registers `fn` for `event` like `on`, runs `fn` on the next matching emit, and then removes that registration before further emits of that event can invoke it again. `once` SHALL return an unsubscribe function that removes the registration if it has not already run.

#### Scenario: Handler runs once then is gone

- **WHEN** a caller registers `bus.once("t", fn)` and the bus emits `"t"` twice
- **THEN** `fn` is invoked exactly once, with the payload of the first emit

#### Scenario: Early unsubscribe prevents the run

- **WHEN** a caller registers `bus.once("t", fn)`, calls the returned unsubscribe, then the bus emits `"t"`
- **THEN** `fn` is not invoked

#### Scenario: Unsubscribe after the run is harmless

- **WHEN** a caller registers `bus.once("t", fn)`, the bus emits `"t"` (so `fn` runs), then the caller calls the returned unsubscribe again
- **THEN** no error is thrown and a further emit does not invoke `fn`

#### Scenario: once accepts the same event shapes as on

- **WHEN** a caller uses `once` with a string event name, an object `{ type }`, or an action creator / command with a `type` property
- **THEN** the registration matches the same event key as `on` would for that argument

### Requirement: Clear all subscriptions with off()

The bus SHALL accept `off()` with no arguments and remove every listener of every event key, including the `"*"` (any-event) listeners. After `off()`, a subsequent emit SHALL not invoke any previously registered handler until new registrations are added.

#### Scenario: off() clears every event

- **WHEN** a bus has listeners on two different event names and on `"*"`, and the caller invokes `bus.off()` with no arguments
- **THEN** emitting either named event or any event does not invoke those listeners

#### Scenario: Per-event off remains

- **WHEN** a bus has listeners on `"a"` and `"b"`, and the caller invokes `bus.off("a")`
- **THEN** listeners of `"a"` are removed and listeners of `"b"` still run on emit

#### Scenario: off(event, fn) still removes one registration

- **WHEN** the same handler is registered twice for one event and the caller invokes `off(event, fn)` once
- **THEN** one registration remains (same behavior as today)

### Requirement: once and off interact safely during emit

While an emit walks the current listener list, a `once` handler that unsubscribes itself, or an `off()` / `off(event)` that clears listeners, SHALL NOT cause the emit loop to skip or double-call remaining handlers that were already selected for that emit. Later emits SHALL see the updated set of listeners.

#### Scenario: once self-removal during emit

- **WHEN** handlers A (once), B (on) are registered in that order for `"t"`, and the bus emits `"t"`
- **THEN** both A and B run for that emit, and a second emit runs only B
