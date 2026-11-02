## MODIFIED Requirements

### Requirement: The registry is attached to a bus
`actionsPlugin()` SHALL return a plugin, a function of a bus; `bus.use(actionsPlugin())` SHALL create a registry of action handlers, set it as the actions of `bus` (`bus.actions`), and return it, with the events type taken from `bus`. `actionsPlugin` SHALL take no argument, and handlers SHALL be bound with `actions.handle`.

#### Scenario: Handlers registered after the bus exists
- **WHEN** `const actions = bus.use(actionsPlugin())` and `actions.handle(getUser, fn)` are called, and `bus.emit(getUser("1"))` follows
- **THEN** `emit` runs `fn` and returns its result

#### Scenario: Initial bindings
- **WHEN** `const actions = bus.use(actionsPlugin())` and `actions.handle(sendMail, smtpSend)` are called
- **THEN** `bus.emit(sendMail(mail))` runs `smtpSend`

#### Scenario: The old list is a type error
- **WHEN** `actionsPlugin([["mail/send", smtpSend]])` is written
- **THEN** it does not type-check

### Requirement: A later actionsPlugin merges into the registry
When the bus already has a registry made by `actionsPlugin` or by `modulePlugin`, `bus.use(actionsPlugin())` SHALL return that same registry; the handlers bound earlier SHALL keep running. An `actions` that is not such a registry (a custom runner `{ run }`) SHALL be replaced as before.

#### Scenario: Two uses share one registry
- **WHEN** `bus.use(actionsPlugin())` is called twice and a handler was bound in the first
- **THEN** both calls return the same registry and `emit` runs the handler of the first

#### Scenario: After the module plugin
- **WHEN** `bus.use(modulePlugin([userModule]))` and then `bus.use(actionsPlugin())` are called, and `actions.handle(action, fn)` is called on the result
- **THEN** the handlers the module binds and `fn` both run, and `app.actions` is that registry

#### Scenario: A custom runner is replaced
- **WHEN** `bus.actions = { run }` is set and then `bus.use(actionsPlugin())` is called
- **THEN** the bus runs the new registry

### Requirement: The registry binds a handler to any action
A handler bound in the registry for the type of an action, by `actions.handle(action, fn)`, SHALL run when that action is emitted and its result SHALL be returned, also when the action was made without a handler (`createAction("user/loaded")`), and when it is emitted as a plain `{ type, payload }` or by its type string. The listeners of the type SHALL be told first, as for any event. `actions.handle` SHALL take an action or a type string and a handler; it SHALL NOT take a list of pairs.

#### Scenario: An action made without a handler gets one
- **WHEN** `actions.handle(userLoaded, fn)` is called and `bus.emit(userLoaded(user))` follows
- **THEN** the listeners of `"user/loaded"` run, `fn` runs as a task with a context, and `emit` returns its result

#### Scenario: The type string works too
- **WHEN** `actions.handle("user/loaded", fn)` is called and `bus.emit("user/loaded", user)` follows
- **THEN** `fn` runs with `user`

#### Scenario: A custom runner without bound keeps working
- **WHEN** `bus.actions = { run }` is assigned, with no `bound`, and a plain action and a command are emitted
- **THEN** the plain action is an event and the command runs through `run`, with no error

#### Scenario: Unbinding returns to an event
- **WHEN** the function that `handle` returned is called and the action is emitted again
- **THEN** only the listeners run, as for an event
