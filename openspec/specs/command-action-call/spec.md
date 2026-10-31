# command-action-call Specification

## Purpose

Calling a command or job builds the same kind of `{ type, payload }` value as `createAction`, and emitting that value on a bus runs the command and returns its result.

## Requirements

### Requirement: A command call builds an action
Calling a command (an action made with a handler, and so a job) with a payload SHALL return `{ type, payload }` whose `type` is the command's type and whose `payload` is the argument. It SHALL NOT run the command's handler.

#### Scenario: Shape matches createAction
- **WHEN** `const double = createAction("math/double", (n: number) => n * 2)` and `double(21)` are evaluated
- **THEN** the value is `{ type: "math/double", payload: 21 }` and the handler has not run

#### Scenario: A contract call still builds an action
- **WHEN** `createAction<Call<string, User>>("user/get")("1")` is evaluated
- **THEN** the value is `{ type: "user/get", payload: "1" }` and no error is thrown

### Requirement: Emitting a command call runs the command
`bus.emit(command(payload))` SHALL notify listeners of the command's type, then run the command (own handler or registry) as a task, and SHALL return the handler's result. A plain `{ type, payload }` that was not produced by calling a command SHALL only notify listeners and SHALL NOT run a command handler.

#### Scenario: Result through emit
- **WHEN** `bus.emit(double(21))` is called for a command with a doubling handler
- **THEN** listeners of `"math/double"` run, the handler runs, and `emit` returns `42`

#### Scenario: Registry wins
- **WHEN** a handler is bound for the command on the bus and `bus.emit(command(payload))` is called
- **THEN** the bound handler runs instead of the command's own

#### Scenario: Plain action is not a command run
- **WHEN** `bus.emit({ type: double.type, payload: 21 })` is called with a plain object
- **THEN** listeners of that type run and `emit` does not return the command's result as a command run (no handler of the command is invoked as a command)

### Requirement: An action creator can carry a handler
`createAction(type, handler, scope?)`, the form `createCommand` had, SHALL return a creator whose calls build `{ type, payload }` like any action creator, and whose emitted calls SHALL run `handler` as a task with a context and return its result, as a command does. Without a handler the creator SHALL stay a plain event.

#### Scenario: Result through emit
- **WHEN** `const double = createAction("math/double", (value: number) => value * 2)` and `bus.emit(double(21))` are evaluated
- **THEN** listeners of `"math/double"` run, the handler runs, and `emit` returns `42`

#### Scenario: Calling builds an action
- **WHEN** `double(21)` is evaluated and not emitted
- **THEN** the value is `{ type: "math/double", payload: 21 }` and the handler has not run

#### Scenario: Without a handler it is an event
- **WHEN** `createAction("user/loaded")` is emitted on a bus with `onUnhandled` set and nobody listens
- **THEN** `onUnhandled` is called, nothing is run and no error is thrown

### Requirement: An action with a handler behaves as a command
An action creator that carries a handler SHALL be accepted wherever a command is: `bus.emit(creator, payload)`, `actions.handle(creator, fn)`, `setHandler(creator, fn)`, `module.use(creator)` and `module.handle(creator, fn)`, and a handler bound for it in the registry SHALL win over its own. It SHALL have `type` and `match` as before.

#### Scenario: The registry overrides the handler
- **WHEN** `actions.handle(double, () => 0)` is called on a bus and `bus.emit(double(21))` follows
- **THEN** `emit` returns `0`; after the returned unbind runs, `emit` returns `42` again

#### Scenario: A module brings it
- **WHEN** a module calls `module.use(double)` and is mounted
- **THEN** `bus.emit(double(21))` returns `42` while the module is mounted

#### Scenario: A policy wraps the handler
- **WHEN** the handler is `latest(fn)` and `bus.emit` is called twice before the first settles
- **THEN** the first call is cancelled and the second returns its result, as for a command

### Requirement: One options object carries handle, prepare and the scope
`createAction(type, { handle, prepare, ...scope })` SHALL read the function fields `handle` and `prepare` as the handler and the payload builder, and every other field as the scope. A function second argument SHALL be the same as `{ handle }`, and then the third argument SHALL be `{ prepare, ...scope }`. `createAction(type)` SHALL make a plain event.

#### Scenario: The createCommand form
- **WHEN** `createAction("user/get", (id: string, { cache }) => …, { cache })` is called on a bus that uses `scopePlugin`
- **THEN** the context of the handler and of the listeners has the `cache` field, typed, as it was for `createCommand`

#### Scenario: Everything in one object
- **WHEN** `createAction("user/rename", { handle, prepare, cache })` is called
- **THEN** `handle` is the handler, `prepare` builds the payload, and `cache` is the only scope field

#### Scenario: A scope alone is unchanged
- **WHEN** `createAction("user/loaded", { store })` is called
- **THEN** the creator is an event with the scope `{ store }`, as before

### Requirement: prepare works with a handler
A creator with `prepare` SHALL build its call from several arguments, `renamed("1", "Ann")`, and the handler of that creator, if any, SHALL receive the payload that `prepare` built and the task context. The creator SHALL tell the call of the bus, which runs the handler, from a call made by the user, by a marker on the context and not by the type of the last argument.

#### Scenario: prepare without a handler
- **WHEN** `createAction("user/renamed", { prepare: (id: string, name: string) => ({ payload: { id, name } }) })` is called with `("1", "Ann")`
- **THEN** it builds `{ type: "user/renamed", payload: { id: "1", name: "Ann" } }`

#### Scenario: prepare and a handler together
- **WHEN** `createAction("user/rename", { prepare, handle })` is emitted as `bus.emit(rename("1", "Ann"))`
- **THEN** `handle` runs with `{ id: "1", name: "Ann" }` and the context, and its result is returned

#### Scenario: An object argument is not a context
- **WHEN** the arguments of a `prepare` creator are two plain objects
- **THEN** building the call uses both as arguments and does not run the handler

### Requirement: The old prepare form is a handler now
`createAction(type, fn)` SHALL treat `fn` as the handler, also when it returns `{ payload }`; the migration is `createAction(type, { prepare: fn })`. A field named `handle` or `prepare` in a scope SHALL be reserved when its value is a function.

#### Scenario: The old prepare is a handler now
- **WHEN** `createAction("user/renamed", (id: string, name: string) => ({ payload: { id, name } }))` is called
- **THEN** it is a handler of one payload, and the migration is `{ prepare: … }`

#### Scenario: A scope with another function field
- **WHEN** a scope has the function field `format`
- **THEN** it stays a scope field and goes on the context

### Requirement: createCommand is not an entity of its own
`createCommand` SHALL NOT be exported. What it did SHALL be done by `createAction`: a handler as the second argument, a scope as the last argument, `type`, `match` and the call that carries the command, and a declared result type through `createAction<Call<Payload, Result>>(type)`. An action made without a handler SHALL be an event: emitting it SHALL NOT throw. `MissingHandlerError` SHALL stay for a job that has no handler.

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

### Requirement: The result type of a string emit comes from the bus
On a bus without an event map, `bus.emit<R>(type, ...payload)` SHALL be accepted and return `R`, so the caller can say what a handler bound for that type returns; `bus.emit(type)` without `R` SHALL return `void`. On a bus with an event map that explicit form SHALL be a type error, and every check of names and payloads SHALL stay as before.

#### Scenario: A hint on a bus without a map
- **WHEN** `const id = bus.emit<string>("user/getId")` is written for `createBus()` with no event map
- **THEN** it type-checks and `id` has the type `string`

#### Scenario: A bus with a map is not loosened
- **WHEN** `typed.emit<string>("user/getId")` or `typed.emit("user/loadde", payload)` is written for `createBus<Events>()`
- **THEN** each is a type error

### Requirement: An event map can give the result type
An entry of an event map written as `Call<Payload, Result>` SHALL give `bus.emit(type, ...payload)` the result type `Result` and check the payload against `Payload`; an entry written as a plain type SHALL keep meaning only a payload, with the result `void`. `Call` SHALL be a type only: it SHALL add nothing to a bundle.

#### Scenario: The result is inferred
- **WHEN** `type Events = { "user/getId": Call<void, string> }` and `const id = bus.emit("user/getId")` are written
- **THEN** `id` has the type `string`, and a payload that is not `void` is a type error

#### Scenario: Plain entries are unchanged
- **WHEN** an event map has `"user/loaded": { id: string }`
- **THEN** `bus.emit("user/loaded", { id: "1" })` returns `void` as before
