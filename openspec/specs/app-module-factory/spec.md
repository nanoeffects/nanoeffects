# app-module-factory Specification

## Purpose
Lets the app that modulePlugin returns create modules typed with the bus it belongs to, so a module in its own file sees the context fields of the bus without a type argument.

## Requirements

### Requirement: The app creates modules typed with the bus
The object returned by `bus.use(modulePlugin(...))` SHALL have `createModule(name, setup)`. It SHALL return a module with that `name` and `setup`, equal to what `createModule(name, setup)` from `nanoeffects/actions` returns. The context that `setup` receives SHALL have the fields that the event map of the bus gives to a task context, without a type argument written by the caller.

#### Scenario: The module has the name and the setup
- **WHEN** `const userModule = app.createModule("user", setup)` is called
- **THEN** `userModule.name` is `"user"` and `userModule.setup` is `setup`

#### Scenario: The context has the fields of the bus
- **WHEN** the bus has `WithContext<{ store }>` and `effectsPlugin({ race })`, and a handler registered in `app.createModule("user", (m) => m.on("loaded", (_, ctx) => …))` reads `ctx.store` and `ctx.race`
- **THEN** both are known to the type checker, and a field that the bus does not have is a type error

#### Scenario: The payload and result come from the command
- **WHEN** `m.handle(getUser, (id, ctx) => …)` is written in such a module and `getUser` was made as `createCommand<string, Promise<User>>("user/get")`
- **THEN** `id` is a string and the handler must return `Promise<User>`

### Requirement: Creating does not mount
`createModule` of the app SHALL NOT mount the module, run `setup`, or keep a reference to the bus or the app. The module SHALL mount only when it is given to `app.mount` or to `modulePlugin`.

#### Scenario: Setup does not run on creation
- **WHEN** `app.createModule("user", setup)` is called and nothing is mounted
- **THEN** `setup` has not been called

#### Scenario: Mounted by the app
- **WHEN** the module is given to `app.mount`
- **THEN** `setup` runs once and `app.isMounted(module)` is true

#### Scenario: Usable on another app
- **WHEN** the same module is given to `mount` of a second app with the same event map
- **THEN** it is mounted there as it would be after `createModule` from `nanoeffects/actions`

### Requirement: The module factory of the library is unchanged
`createModule` from `nanoeffects/actions` SHALL keep its signature and behavior, and `modulePlugin` SHALL keep what it returned before, with `createModule` added.

#### Scenario: Existing code runs as before
- **WHEN** code written before this change calls `createModule<Events>("user", setup)` and `app.mount(module)`
- **THEN** it type-checks and behaves as before
