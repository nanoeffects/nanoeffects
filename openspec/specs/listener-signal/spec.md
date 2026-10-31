# listener-signal Specification

## Purpose

Lets code that already holds an `AbortSignal` bind the life of a bus listener to it, as `addEventListener(type, fn, { signal })` does, without keeping an unsubscribe function.

## Requirements

### Requirement: signalPlugin removes a listener when its signal aborts
After `bus.use(signalPlugin())`, `bus.on(event, handler, { signal })` and `bus.once(event, handler, { signal })` SHALL remove that listener when `signal` aborts, for every form of `event` that `on` takes. A handler that already runs SHALL NOT be aborted by it. A `signal` that is aborted already SHALL add no listener. The result SHALL still be the unsubscribe function.

#### Scenario: Abort removes the listener
- **WHEN** `bus.on("saved", handler, { signal })` is called, `controller.abort()` is called and `"saved"` is emitted
- **THEN** `handler` is not called, and `bus.get("saved")` has no listener of it

#### Scenario: A signal that is aborted already
- **WHEN** `bus.on("saved", handler, { signal })` is called with an aborted signal
- **THEN** no listener is added and the returned function is safe to call

#### Scenario: A running handler goes on
- **WHEN** the signal aborts while `handler` of an earlier emit is still running
- **THEN** the `ctx.signal` of that run is not aborted by it

#### Scenario: once with a signal
- **WHEN** `bus.once("saved", handler, { signal })` is called and the signal aborts before the first emit
- **THEN** `handler` never runs

### Requirement: The link is released with the listener
The subscription on `signal` SHALL be removed when the listener is removed by the returned unsubscribe function or, for `once`, when it has run. A long-lived signal given to many short listeners SHALL NOT keep them alive.

#### Scenario: Many listeners on one signal
- **WHEN** five hundred listeners are added with the same `signal` and each is unsubscribed
- **THEN** none of them is kept by the signal, and a later abort does nothing

### Requirement: Without the plugin or a signal nothing changes
A bus without `signalPlugin` SHALL ignore `signal` in the options of `on`, as it ignores `traceId` without `tracePlugin`. With the plugin, a call without `signal` SHALL behave and cost as without it. The type of the options SHALL be the same with and without the plugin, and `createBus` SHALL NOT grow.

#### Scenario: No plugin
- **WHEN** `bus.on("saved", handler, { signal })` is called on a bus without the plugin and the signal aborts
- **THEN** the listener stays, as before this change

#### Scenario: The core does not grow
- **WHEN** `createBus` is bundled alone before and after the change
- **THEN** the size is the same

### Requirement: It works in any order with the other plugins
`signalPlugin` SHALL keep the options it does not read (`traceId`) and pass them on, and SHALL work with `matchPlugin`, `tracePlugin` and `devPlugin` in any order, and the `on` of a module and of `extendBus` SHALL pass `signal` on.

#### Scenario: Predicate subscription with a signal
- **WHEN** `matchPlugin` and `signalPlugin` are used in either order and a predicate subscription is made with `{ signal }`
- **THEN** the signal removes it and `bus.get("*")` no longer lists it

#### Scenario: Matrix
- **WHEN** the plugin matrix puts `signalPlugin` in every order with the others
- **THEN** its listener probe passes for each
