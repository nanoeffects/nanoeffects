## Purpose
Lets emitterPlugin turn an action creator into a callback that emits its action on a bus, for the subscriptions of state managers, while the creator stays a plain createAction.

## ADDED Requirements

### Requirement: The bus gets an emitter for action creators
`emitterPlugin()` from `nanoeffects/actions` SHALL, when used as `bus.use(emitterPlugin())`, add `bus.emitter` to that bus and SHALL return the same bus. `bus.emitter(creator)` SHALL return a function that, when called with arguments, emits `creator(...args)` on that bus with `bus.emit`.

#### Scenario: The returned function emits the action
- **WHEN** `const emitNameChanged = bus.emitter(nameChanged)` and a handler listens with `bus.on(nameChanged, fn)`, then `emitNameChanged("Eva")` is called
- **THEN** `fn` receives `"Eva"`

#### Scenario: Usable as a callback
- **WHEN** `emitNameChanged` is passed to a subscription that calls it with a value, such as `$name.listen(emitNameChanged)`
- **THEN** each call emits the action with that value

#### Scenario: Arguments are given to the creator as they are
- **WHEN** the creator has a `prepare` function with several arguments and the emitter is called with them
- **THEN** the emitted payload is what `prepare` returns for those arguments

#### Scenario: Plugin returns the same bus
- **WHEN** `const result = bus.use(emitterPlugin())`
- **THEN** `result === bus`

### Requirement: The creator keeps its meaning
Using `emitterPlugin` SHALL NOT change `createAction`, `bus.emit`, `bus.on` or the core `Bus` type. A creator called as `nameChanged("Eva")` SHALL only build `{ type, payload }`, with or without the plugin.

#### Scenario: Calling the creator does not emit
- **WHEN** `nameChanged("Eva")` is called on a bus with the plugin
- **THEN** no listener runs until the result is passed to `bus.emit`

#### Scenario: A bus without the plugin has no emitter
- **WHEN** a bus is made with `createBus()` and the plugin is not used
- **THEN** `bus.emitter` is not defined

### Requirement: The emitter is typed from the creator
`bus.emitter` SHALL accept a creator without a payload type (`createAction("x")`), taking the payload type from the event map, and a creator with a payload type (`createAction<P>("x")` or one with `prepare`), taking the argument types from the creator. The overload for creators without a payload type SHALL come first, as in `On`.

#### Scenario: Payload type from the event map
- **WHEN** `bus` has the event map `{ "name/changed": string }` and `bus.emitter(createAction("name/changed"))` is called
- **THEN** the returned function takes a `string`, and a `number` is a type error

#### Scenario: Payload type from the creator
- **WHEN** `bus.emitter(createAction<number>("counter/added"))` is called
- **THEN** the returned function takes a `number`, and a `string` is a type error

#### Scenario: Arguments of a prepare function
- **WHEN** the creator is `createAction("user/renamed", (id: string, name: string) => ({ payload: { id, name } }))`
- **THEN** the returned function takes `(id: string, name: string)`
