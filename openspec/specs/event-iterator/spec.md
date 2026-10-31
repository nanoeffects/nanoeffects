# event-iterator Specification

## Purpose

Gives the payloads of one event as an async iterator, so a loop (`for await`) can read a stream of events and end with a signal, with a bounded buffer for a slow loop.

## Requirements

### Requirement: events returns an async iterator of one event
`events(source, event, options)` from `nanoeffects/observable` SHALL take a bus, or a task context, as `source` and an event name, an action creator or a command as `event`, as `bus.on` does. It SHALL return an object that is an `AsyncIterableIterator` of the payloads emitted after the call, in order. It SHALL listen from the call, not from the first `next()`, so a payload between the two is not lost. The payload type SHALL be the one `bus.on` gives for that event.

#### Scenario: A loop reads the payloads
- **WHEN** `for await (const query of events(bus, "query"))` runs and `"query"` is emitted with `"a"` and `"b"`
- **THEN** the loop body runs with `"a"` and then `"b"`

#### Scenario: Listening starts at the call
- **WHEN** `const stream = events(bus, "query")` is called, `"query"` is emitted with `"a"` and then `stream.next()` is called
- **THEN** it resolves with `"a"`

#### Scenario: A creator gives the type
- **WHEN** `events(bus, queryChanged)` is type-checked with an action creator of a `string` payload
- **THEN** the loop variable has the type `string`

### Requirement: The iterator ends with its signal
When `options.signal` aborts, or, for a task context as `source`, when the task aborts, the iterator SHALL remove its listener, drop the values it holds, and reject the pending and the next `next()` once with the abort reason, then report `done`. A `signal` that is aborted already SHALL do the same at the first `next()`.

#### Scenario: Abort rejects a waiting loop
- **WHEN** a loop waits for the next payload and `controller.abort()` is called
- **THEN** the `next()` rejects with the reason of the controller, the loop ends with that error and `bus.get("query")` has no listener of it

#### Scenario: A task context as the source
- **WHEN** `events(ctx, "query")` is read inside a handler and the task is aborted
- **THEN** the iterator ends as for an aborted signal

### Requirement: Leaving the loop unsubscribes
`return()` of the iterator, called by `break`, `return` or a throw inside `for await`, SHALL remove the listener and drop the held values, and the iterator SHALL be done after it. It SHALL be safe to call twice.

#### Scenario: break
- **WHEN** a `for await` loop over `events(bus, "query")` leaves with `break`
- **THEN** `bus.get("query")` has no listener of it and later emits are not kept

### Requirement: A slow loop is bounded by a buffer
`options.buffer` SHALL be the most payloads the iterator holds while the loop is busy, and SHALL default to `Infinity`. When the buffer is full, `options.overflow` SHALL pick what is lost: `"drop-oldest"` (the default) removes the oldest payload to make room, `"drop-newest"` ignores the new one. Nothing else is lost, and the order of the rest is kept.

#### Scenario: drop-oldest
- **WHEN** `buffer` is `2`, `overflow` is the default and `1`, `2`, `3` are emitted before the loop reads
- **THEN** the loop reads `2` and then `3`

#### Scenario: drop-newest
- **WHEN** `buffer` is `2`, `overflow` is `"drop-newest"` and `1`, `2`, `3` are emitted before the loop reads
- **THEN** the loop reads `1` and then `2`

#### Scenario: Unbounded by default
- **WHEN** a thousand payloads are emitted before the loop reads
- **THEN** the loop reads all of them in order

### Requirement: It is an optional entry and adds nothing to the bus
`events` SHALL live in the `nanoeffects/observable` entry, SHALL use only `source.on`, and SHALL NOT change `createBus`, a bus that does not call it, or the emit path. A payload that is `undefined` SHALL be delivered like any other.

#### Scenario: The core does not grow
- **WHEN** `createBus` is bundled alone before and after the change
- **THEN** the size is the same

#### Scenario: A payload that is undefined
- **WHEN** an event without a payload is emitted while a loop reads it
- **THEN** the loop body runs once with `undefined`
