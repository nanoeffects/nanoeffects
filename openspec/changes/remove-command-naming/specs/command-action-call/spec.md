## RENAMED Requirements

- FROM: `### Requirement: A command call builds an action`
- TO: `### Requirement: Calling an action with a handler builds an action`

- FROM: `### Requirement: Emitting a command call runs the command`
- TO: `### Requirement: Emitting a call of an action with a handler runs the handler`

- FROM: `### Requirement: An action with a handler behaves as a command`
- TO: `### Requirement: An action with a handler is accepted wherever a handler is bound`

- FROM: `### Requirement: createCommand is not an entity of its own`
- TO: `### Requirement: There is one creator, createAction`

## MODIFIED Requirements

### Requirement: Calling an action with a handler builds an action
Calling an action made with a handler (and so a job) with a payload SHALL return `{ type, payload }` whose `type` is the action's type and whose `payload` is the argument. It SHALL NOT run the handler.

#### Scenario: Shape matches createAction
- **WHEN** `const double = createAction("math/double", (n: number) => n * 2)` and `double(21)` are evaluated
- **THEN** the value is `{ type: "math/double", payload: 21 }` and the handler has not run

#### Scenario: A contract call still builds an action
- **WHEN** `createAction<Call<string, User>>("user/get")("1")` is evaluated
- **THEN** the value is `{ type: "user/get", payload: "1" }` and no error is thrown

### Requirement: Emitting a call of an action with a handler runs the handler
`bus.emit(action(payload))` SHALL notify listeners of the action's type, then run the handler (its own or the one bound in the registry) as a task, and SHALL return the handler's result. A plain `{ type, payload }` that was not produced by calling such an action SHALL only notify listeners and SHALL NOT run a handler.

#### Scenario: Result through emit
- **WHEN** `bus.emit(double(21))` is called for an action with a doubling handler
- **THEN** listeners of `"math/double"` run, the handler runs, and `emit` returns `42`

#### Scenario: Registry wins
- **WHEN** a handler is bound for the action on the bus and `bus.emit(action(payload))` is called
- **THEN** the bound handler runs instead of the action's own

#### Scenario: Plain action is not a command run
- **WHEN** `bus.emit({ type: double.type, payload: 21 })` is called with a plain object
- **THEN** listeners of that type run and no handler of the action is invoked as a handler

### Requirement: An action with a handler is accepted wherever a handler is bound
An action creator that carries a handler SHALL be accepted by `bus.emit(creator, payload)`, `actions.handle(creator, fn)`, `setHandler(creator, fn)`, `module.use(creator)` and `module.handle(creator, fn)`, and a handler bound for it in the registry SHALL win over its own. It SHALL have `type` and `match`.

#### Scenario: The registry overrides the handler
- **WHEN** `actions.handle(double, () => 0)` is called on a bus and `bus.emit(double(21))` follows
- **THEN** `emit` returns `0`; after the returned unbind runs, `emit` returns `42` again

#### Scenario: A module brings it
- **WHEN** a module calls `module.use(double)` and is mounted
- **THEN** `bus.emit(double(21))` returns `42` while the module is mounted

#### Scenario: A policy wraps the handler
- **WHEN** the handler is `latest(fn)` and `bus.emit` is called twice before the first settles
- **THEN** the first call is cancelled and the second returns its result

### Requirement: There is one creator, createAction
`nanoeffects/actions` SHALL NOT export `createCommand`, and SHALL NOT export a type or function whose name contains `Command`. `createAction` SHALL take a handler as the second argument, a scope as the last argument, and give `type`, `match` and the call that carries the handler; a declared result type is `createAction<Call<Payload, Result>>(type)`. An action made without a handler SHALL be an event: emitting it SHALL NOT throw. `MissingHandlerError` SHALL stay for a job that has no handler.

#### Scenario: A declared result type
- **WHEN** `const sendMail = createAction<Call<Mail, void>>("mail/send")` is written
- **THEN** `bus.emit(sendMail(mail))` has the type `void`, calling it builds `{ type: "mail/send", payload: mail }`, and the payload is checked against `Mail`

#### Scenario: A bound declared action runs
- **WHEN** `bus.use(actionsPlugin([setHandler(sendMail, smtpSend)]))` is used and `bus.emit(sendMail(mail))` follows
- **THEN** `smtpSend` runs and its result is returned

#### Scenario: Nothing bound is an event
- **WHEN** `bus.emit(sendMail(mail))` is called with no handler bound and none listening
- **THEN** it does not throw and `onUnhandled` is called

#### Scenario: A job without a handler still throws
- **WHEN** a job made without a handler is emitted with nothing bound
- **THEN** `emit` throws `MissingHandlerError`, as in `job-outcomes`
