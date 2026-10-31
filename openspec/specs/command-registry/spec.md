# command-registry Specification

## Purpose
Say how the registry of command handlers is connected to a bus: it is attached to an existing bus, and the constructor of the bus has no option for it.

## Requirements

### Requirement: The registry is attached to a bus
`actionsPlugin(bindings?)` SHALL return a plugin, a function of a bus; `bus.use(actionsPlugin(bindings?))` SHALL create a registry of action handlers, set it as the actions of `bus` (`bus.actions`), and return it, with the events type taken from `bus`.

#### Scenario: Handlers registered after the bus exists
- **WHEN** `const actions = bus.use(actionsPlugin())` and `actions.handle(getUser, fn)` are called, and `bus.emit(getUser("1"))` follows
- **THEN** `emit` runs `fn` and returns its result

#### Scenario: Initial bindings
- **WHEN** `bus.use(actionsPlugin([setHandler(sendMail, smtpSend)]))` is called
- **THEN** `bus.emit(sendMail(mail))` runs `smtpSend`

### Requirement: The constructor has no actions option
`createBus` SHALL NOT take an `actions` option (nor the old `commands` one); the actions of a bus SHALL be set only through `bus.use(actionsPlugin())`, through the module plugin, or by assigning `bus.actions`.

#### Scenario: The old option is a type error
- **WHEN** `createBus({ actions: bus.use(actionsPlugin()) })` is written
- **THEN** it does not type-check

#### Scenario: A custom runner is assigned
- **WHEN** `bus.actions = { run }` is assigned and an action with a handler is emitted
- **THEN** `emit` calls `run` with the action, the payload and the task context

### Requirement: Without a registry a command runs itself
A bus with no actions set SHALL run an action that carries a handler (a command, including one made by `createAction(type, handler)`) with that handler when it is emitted, as `bus.emit(command(payload))` or the two-argument form, and SHALL throw `MissingHandlerError` for a job that has none.

#### Scenario: A command that carries a handler
- **WHEN** a bus has no registry and `bus.emit(double(21))` is called for an action made with a handler
- **THEN** the handler runs and its result is returned

#### Scenario: A contract without a handler
- **WHEN** a bus has no registry and a job made without a handler is emitted
- **THEN** it throws `No handler for command "<type>"`

### Requirement: The module plugin uses or attaches the registry
`bus.use(modulePlugin(modules))` SHALL use the registry that the bus has, and SHALL attach one with `actionsPlugin()` when the bus has none; the registry SHALL be returned as `actions`.

#### Scenario: The bus already has a registry
- **WHEN** `bus.use(actionsPlugin())` was called before `bus.use(modulePlugin([...]))`
- **THEN** the modules bind handlers in that registry and `app.actions` is that registry

#### Scenario: The bus has none
- **WHEN** `bus.use(modulePlugin([...]))` is called on a bus with no registry
- **THEN** a registry is attached, modules bind in it, and `app.actions` is it

### Requirement: A later actionsPlugin merges into the registry
When the bus already has a registry made by `actionsPlugin` or by `modulePlugin`, `bus.use(actionsPlugin(bindings))` SHALL bind `bindings` in that registry and return that same registry; the handlers bound earlier SHALL keep running. An `actions` that is not such a registry (a custom runner `{ run }`) SHALL be replaced as before.

#### Scenario: Two uses share one registry
- **WHEN** `bus.use(actionsPlugin())` is called twice and a handler was bound in the first
- **THEN** both calls return the same registry and `emit` runs the handler of the first

#### Scenario: After the module plugin
- **WHEN** `bus.use(modulePlugin([userModule]))` and then `bus.use(actionsPlugin([binding]))` are called
- **THEN** the handlers the module binds and `binding` both run, and `app.actions` is that registry

#### Scenario: A custom runner is replaced
- **WHEN** `bus.actions = { run }` is set and then `bus.use(actionsPlugin())` is called
- **THEN** the bus runs the new registry

### Requirement: The registry binds a handler to any action
A handler bound in the registry for the type of an action, by `actions.handle(action, fn)` or `setHandler(action, fn)`, SHALL run when that action is emitted and its result SHALL be returned, also when the action was made without a handler (`createAction("user/loaded")`), and when it is emitted as a plain `{ type, payload }` or by its type string. The listeners of the type SHALL be told first, as for any event.

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

### Requirement: An action that nobody handles is an event
An action that has no handler of its own and none bound in the registry SHALL be only an event: emitting it SHALL NOT throw, SHALL return `undefined`, and SHALL call `onUnhandled` when nobody listens. An action that has a bound or own handler SHALL NOT call `onUnhandled`.

#### Scenario: Nothing bound, nothing heard
- **WHEN** `createAction("user/loaded")` is emitted on a bus with `onUnhandled` set, nobody listens, and no handler is bound
- **THEN** `onUnhandled` is called and no error is thrown

#### Scenario: A bound handler counts as handled
- **WHEN** a handler is bound for the type, nobody listens, and the action is emitted
- **THEN** the handler runs and `onUnhandled` is not called

#### Scenario: Plugin order does not matter
- **WHEN** `actionsPlugin` is used before or after the other plugins of the bus, in any order
- **THEN** a handler bound in the registry runs for an emitted action with the same result
