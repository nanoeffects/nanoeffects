## ADDED Requirements

### Requirement: take accepts an action creator as its event
`take(ctx, event, options?)` SHALL accept an action creator in place of an event name, both a creator with a payload type and a creator without one. It SHALL wait for the next emit of the type of that creator and resolve with its payload, exactly as it does for the name. The form with a name SHALL be unchanged.

#### Scenario: A creator with a payload type
- **WHEN** a task awaits `take(ctx, saved)` with `saved = createAction<string>("saved")` and the bus emits `saved("a")`
- **THEN** the promise resolves with `"a"`, typed as `string`

#### Scenario: A creator without a payload type
- **WHEN** a task awaits `take(ctx, saved)` with `saved = createAction("saved")` on a bus whose event map says `saved` carries a number, and the bus emits `saved(1)`
- **THEN** the promise resolves with `1`, typed as `number`

#### Scenario: The name still works
- **WHEN** `take(ctx, "saved")` is called
- **THEN** it behaves as before

### Requirement: take types the result and the predicate from the creator
The result type of `take` with a creator SHALL be the payload type of the creator, or the payload type of the event map for a creator without one. `options.predicate` SHALL be checked against that type, a type guard narrowing the result.

#### Scenario: The predicate and the signal
- **WHEN** `take(ctx, saved, { predicate, signal })` is awaited with a creator
- **THEN** payloads the predicate rejects are skipped, a type guard narrows the result, and an abort of the task or of `signal` rejects with the abort reason

#### Scenario: A wrong predicate is a type error
- **WHEN** the predicate takes a parameter that is not the payload type of the creator
- **THEN** the call does not type-check

### Requirement: The take on the context takes a creator too
The `take` that `effectsPlugin` puts on a task context SHALL accept the same arguments as `take(ctx, …)` without its `ctx`, including an action creator.

#### Scenario: The bound take
- **WHEN** a handler calls `take(saved)` from its context with a creator
- **THEN** it resolves with the payload of the next `saved`
