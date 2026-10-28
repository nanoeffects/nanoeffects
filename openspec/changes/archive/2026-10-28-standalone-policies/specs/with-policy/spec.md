# Spec Delta

## Purpose

Lets a policy or any task be called as a plain function without a bus: no context argument, cancellable, and disposable. It serves callbacks of UI code and state managers that have no event bus.

## ADDED Requirements

### Requirement: withPolicy makes a task a plain function
`withPolicy(task)` SHALL return a function that takes the payload of `task` and returns a promise of its result. The caller SHALL NOT pass a context. A task whose payload may be absent SHALL be callable without an argument.

#### Scenario: A debounced callback
- **WHEN** `const onChange = withPolicy(debounce(100, callback))` is made and `onChange(1)` and `onChange(2)` are called within 100 ms
- **THEN** `callback` runs once, with `2`, 100 ms after the last call, and the promise of the first call resolves with `undefined`

#### Scenario: A task without payload
- **WHEN** `withPolicy(task)` is made for a task whose payload is `void` and it is called as `run()`
- **THEN** the task runs with `undefined` as its payload and no type error is reported

### Requirement: Policy state lives across calls
The returned function SHALL keep the state of the wrapped policy between calls, so `latest`, `throttle`, `leading`, `queue` and `debounce` behave as they do on a bus.

#### Scenario: Latest wins
- **WHEN** `const load = withPolicy(latest(loadUser))` is made and `load(1)` is called, then `load(2)` before the first run ends
- **THEN** the signal of the first run is aborted and only the second run delivers its result

### Requirement: The callback gets a task context without a bus
The task SHALL be called with `(payload, ctx)`, where `ctx.signal` is aborted by `cancel`, `ctx.abort` aborts that call, and `ctx.run` starts a child task. `ctx.emit` and `ctx.on` SHALL do nothing and SHALL NOT throw.

#### Scenario: A bus-shaped callback runs unchanged
- **WHEN** a callback written as `async (id, { signal, emit }) => { ... emit("loaded", user) }` is wrapped and called
- **THEN** it runs, `signal` is the signal of the call, and `emit` returns without effect

### Requirement: cancel aborts pending and running calls
The returned function SHALL have `cancel(reason?)`. It SHALL abort every call that has not finished, so a pending debounce never runs and a running call sees an aborted signal. Calls made after `cancel` SHALL work normally.

#### Scenario: Cancel a pending debounce
- **WHEN** `onChange(1)` is called and `onChange.cancel()` is called before the wait ends
- **THEN** `callback` never runs and the promise of `onChange(1)` resolves with `undefined`

#### Scenario: Use after cancel
- **WHEN** `onChange.cancel()` is called and then `onChange(2)`
- **THEN** `callback` runs with `2` after the wait

#### Scenario: Cancel with nothing pending
- **WHEN** `cancel()` is called with no pending call
- **THEN** it does nothing and does not throw

### Requirement: Disposal equals cancel
Where `Symbol.dispose` exists, the returned function SHALL have a `[Symbol.dispose]()` method that does what `cancel()` does. Where it does not exist, the function SHALL still be created and SHALL have no such key.

#### Scenario: using
- **WHEN** a function made by `withPolicy` is bound with `using` and the scope ends
- **THEN** its pending calls are cancelled

#### Scenario: A runtime without Symbol.dispose
- **WHEN** `withPolicy(task)` is called on a runtime where `Symbol.dispose` is undefined
- **THEN** it returns a working function with `cancel` and no extra property

### Requirement: Errors and results follow the task
A value returned by the task SHALL resolve the promise; an error thrown or rejected SHALL reject it. A call dropped or aborted by the policy SHALL resolve with `undefined`, as on a bus.

#### Scenario: A rejected task
- **WHEN** the wrapped callback throws `new Error("x")`
- **THEN** the promise returned to the caller rejects with that error

### Requirement: withPolicy is separate from the bus and tree-shakable
`withPolicy` SHALL be a named export of `nanoeffects/policies` and SHALL NOT import the bus or the tracer. A bundle that does not use it SHALL NOT contain it.

#### Scenario: Not imported, not bundled
- **WHEN** an app imports only `debounce` from `nanoeffects/policies` and is bundled
- **THEN** the code of `withPolicy` is not in the output
