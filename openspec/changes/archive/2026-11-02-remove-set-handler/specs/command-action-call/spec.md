## MODIFIED Requirements

### Requirement: An action with a handler is accepted wherever a handler is bound
An action creator that carries a handler SHALL be accepted by `bus.emit(creator, payload)`, `actions.handle(creator, fn)`, `module.use(creator)` and `module.handle(creator, fn)`, and a handler bound for it in the registry SHALL win over its own. It SHALL have `type` and `match`. `nanoeffects/actions` SHALL NOT export `setHandler`.

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
- **WHEN** `const actions = bus.use(actionsPlugin())`, `actions.handle(sendMail, smtpSend)` and `bus.emit(sendMail(mail))` follow in that order
- **THEN** `smtpSend` runs and its result is returned

#### Scenario: Nothing bound is an event
- **WHEN** `bus.emit(sendMail(mail))` is called with no handler bound and none listening
- **THEN** it does not throw and `onUnhandled` is called

#### Scenario: A job without a handler still throws
- **WHEN** a job made without a handler is emitted with nothing bound
- **THEN** `emit` throws `MissingHandlerError`, as in `job-outcomes`
