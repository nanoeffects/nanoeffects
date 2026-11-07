# Spec Delta

## MODIFIED Requirements

### Requirement: The form is told by the number of arguments
`race` SHALL take one argument as the short form and two as the `ctx` form. `all` and `allSettled` SHALL take one argument as the short form and three as the `ctx` form; for two arguments they SHALL decide by the first. It is a context, and the call is the `ctx` form, when it is not an array and its `signal` is an abort signal or it has no function value. Otherwise it is the effects, and the second argument is the options of the short form. A single argument that is a context, an object whose `signal` is an abort signal, SHALL throw a `TypeError` that says the effects are missing, and SHALL start nothing. An effects object with a key named `signal` is still effects: its value is a starter, a function, and not an abort signal.

#### Scenario: A forgotten effects argument
- **WHEN** `all(ctx)` is called with a task context and no effects
- **THEN** it throws a `TypeError` and starts no timer or starter

#### Scenario: A starter named signal
- **WHEN** `all({ signal: (child) => load(child.signal) })` is written
- **THEN** it is the short form and returns a starter

#### Scenario: An empty object as a context
- **WHEN** `all({}, { a: delay(10) })` is called
- **THEN** it is the `ctx` form and returns a promise, as before

#### Scenario: Effects and options are the short form
- **WHEN** `all({ a: first, b: second }, { concurrency: 1 })` is called, where `first` and `second` are functions
- **THEN** it returns a starter and starts nothing until a group calls it

#### Scenario: An array of effects and options
- **WHEN** `allSettled([first, second], { concurrency: 1 })` is called
- **THEN** it returns a starter, because an array is never a context

#### Scenario: A context and an array of effects
- **WHEN** `all({}, [first])` or `all(ctx, [first])` is called
- **THEN** it is the `ctx` form and returns a promise, as before

#### Scenario: Null options
- **WHEN** `all({ a: first }, null)` is called
- **THEN** it returns a starter that runs with no limit

#### Scenario: Two empty objects stay the ctx form
- **WHEN** `all({}, {})` is called
- **THEN** it is the `ctx` form and returns a promise, as before

#### Scenario: A context with a signal is told by its signal
- **WHEN** `all(controller, effects)` is called with an `AbortController`, or `all(ctx, effects)` with a task context
- **THEN** it is the `ctx` form, because the `signal` of the first argument is an abort signal

#### Scenario: race tells two arguments by the count
- **WHEN** `race({ a: first }, { b: second })` is called
- **THEN** the first argument is read as a context and the call is the `ctx` form, as before
