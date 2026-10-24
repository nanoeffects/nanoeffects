## Purpose
Lets a handler subscribe to the events of a bus that a predicate picks, instead of to one named event, with type guards that narrow the payload. It is a plugin: a bus that does not use it is unchanged.

## ADDED Requirements

### Requirement: A plugin lets on, once and off take a predicate
`bus.use(matchPlugin())` from `nanoeffects/match` SHALL make `on`, `once` and `off` of that bus accept a function as the first argument and SHALL return the same bus. A function whose `type` property is a string (an action creator, a command) SHALL keep its meaning. A function whose `type` is not a string SHALL be a predicate. `createBus` SHALL not import the plugin, and its size SHALL not grow.

#### Scenario: A predicate picks the events
- **WHEN** `bus.on((action) => action.type.startsWith("user/"), handler)` is used and `user/loaded`, `user/failed` and `order/placed` are emitted
- **THEN** the handler runs for the first two, with the payload and the context of each

#### Scenario: A creator keeps its meaning
- **WHEN** the plugin is used and `bus.on(userLoaded, handler)` is called with an action creator
- **THEN** the handler runs for `userLoaded` and for no other event, as without the plugin

#### Scenario: The plugin returns the same bus
- **WHEN** `const result = bus.use(matchPlugin())`
- **THEN** `result === bus`

#### Scenario: The core does not grow
- **WHEN** `createBus` is bundled alone before and after the change
- **THEN** the size is the same, and the bundle does not contain the plugin

### Requirement: The predicate gets the action of every event
The predicate SHALL be called with `{ type, payload }` of each event of the bus, once for each subscription, and the handler SHALL run, with the payload and the task context of that event, when it returns true. `ctx.type` SHALL be the type of the event. The predicate SHALL run after the listeners of the event itself, in the order of subscription, and SHALL not be called after the subscription is removed.

#### Scenario: The context is the one of the event
- **WHEN** the handler of a predicate subscription runs for `user/loaded`
- **THEN** `ctx.type` is `"user/loaded"` and the payload is the one that was emitted

#### Scenario: Listeners of the event run first
- **WHEN** a listener of `user/loaded` and a predicate subscription that matches it were both added, the listener first
- **THEN** the listener runs before the handler of the predicate

#### Scenario: Nothing runs after unsubscribe
- **WHEN** the function that `on` returned is called
- **THEN** neither the predicate nor the handler is called for later events

### Requirement: A type guard narrows the payload
A predicate that is a type guard `(action): action is A` SHALL give the handler the payload type of `A`. A predicate that only returns a boolean SHALL give it the payload type of the events of the bus.

#### Scenario: A guard narrows
- **WHEN** the guard is `(action): action is { type: "user/loaded"; payload: User }`
- **THEN** the handler gets `user` typed as `User`

#### Scenario: A boolean predicate does not narrow
- **WHEN** the predicate returns a boolean and is not a guard
- **THEN** the payload of the handler has the type of the payloads of all events of the bus

#### Scenario: Existing overloads are unchanged
- **WHEN** the plugin is used and a handler is added for an event name, an action creator or a command
- **THEN** its payload and context are typed as before

### Requirement: Handlers keep their policies and tasks
The handler of a predicate subscription SHALL run as a task of the event. A policy (`latest`, `debounce`, `throttle`, `queue`, …) or an effect (`retry`, `timeout`) around the handler SHALL work as for any handler.

#### Scenario: A policy around the handler
- **WHEN** the handler is wrapped in `latest(...)` and two matching events come one after the other
- **THEN** the first run is aborted by the second

### Requirement: once and off work with predicates
`once(predicate, handler)` SHALL remove the subscription before the first handler call, that is at the first event the predicate accepts, not at the first event. `off(predicate, handler)` SHALL remove that handler of that predicate, and `off(predicate)` SHALL remove every handler of it. `off()` with no arguments SHALL clear every subscription, those of predicates included. `ctx.on(predicate, handler)` SHALL be removed when the task is aborted.

#### Scenario: once waits for a match
- **WHEN** `bus.once(predicate, handler)` is used and an event the predicate rejects comes first, then one it accepts, then another it accepts
- **THEN** the handler runs once, for the second event

#### Scenario: off by predicate
- **WHEN** two handlers were added with the same predicate and `bus.off(predicate)` is called
- **THEN** neither runs for later events

#### Scenario: off by handler
- **WHEN** two handlers were added with the same predicate and `bus.off(predicate, first)` is called
- **THEN** only the second runs for later events

#### Scenario: The task ends the subscription
- **WHEN** a handler adds a subscription with `ctx.on(predicate, …)` and its task is aborted
- **THEN** the subscription is removed

### Requirement: Errors of a predicate are errors of a handler
An error thrown by a predicate SHALL be handled like an error of a handler: thrown to the caller of `emit`, and the later handlers not run, or passed to `onError` when it is set, with the other handlers running.

#### Scenario: Without onError
- **WHEN** a predicate throws and the bus has no `onError`
- **THEN** `emit` throws that error

#### Scenario: With onError
- **WHEN** a predicate throws and the bus has an `onError`
- **THEN** `onError` gets the error and the other handlers of the event run

### Requirement: The costs are documented and bounded
A predicate subscription SHALL make one task per emitted event, whether or not the predicate accepts it, and a bus with such a subscription SHALL not report any event as unheard. The documentation SHALL say both, and that for a few known events `on(creator, handler)` is cheaper. Emit on a bus without the plugin SHALL cost what it did before.

#### Scenario: onUnhandled
- **WHEN** a predicate subscription exists and an event is emitted that nothing else listens to and the predicate rejects
- **THEN** `onUnhandled` is not called for it

#### Scenario: No plugin, no cost
- **WHEN** 100 000 events are emitted on a bus without the plugin, before and after the change
- **THEN** the time is the same within the noise of the benchmark

### Requirement: The plugin and devPlugin work in any order
`matchPlugin` and `devPlugin` SHALL give the same results whichever is used first: predicate subscriptions work, `once` and `off` work, and the listeners are counted by `devPlugin` once and under `"*"`. Disconnecting `devPlugin` SHALL not remove the behavior of `matchPlugin`.

#### Scenario: matchPlugin first
- **WHEN** `bus.use(matchPlugin())` and then `bus.use(devPlugin())` are called and a predicate subscription is added
- **THEN** it works and is counted once under `"*"`

#### Scenario: devPlugin first
- **WHEN** `bus.use(devPlugin())` and then `bus.use(matchPlugin())` are called and a predicate subscription is added
- **THEN** it works and is counted once under `"*"`

#### Scenario: Disconnect in either order
- **WHEN** `devPlugin` is disconnected, in either order of use
- **THEN** `bus.on(predicate, handler)`, `once` and `off` still work

### Requirement: Subscriptions do not leak
Removing a predicate subscription (by its function, `off`, `once` after the match, or an aborted task) SHALL leave nothing that keeps the handler or the predicate alive.

#### Scenario: Collectable after removal
- **WHEN** many predicate subscriptions are added and removed
- **THEN** their handlers and predicates are collectable (a `WeakRef` to each is cleared after `global.gc`)

### Requirement: The docs show the plugin
The documentation SHALL describe `matchPlugin` on the plugins page and in the guide, with a type-checked example, and SHALL name the costs.

#### Scenario: Examples are checked
- **WHEN** `pnpm docs:check` runs
- **THEN** every code block about the plugin type-checks against the source
