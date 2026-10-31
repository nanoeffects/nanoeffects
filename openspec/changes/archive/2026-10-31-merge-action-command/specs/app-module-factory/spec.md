## MODIFIED Requirements

### Requirement: The app creates modules typed with the bus
The object returned by `bus.use(modulePlugin(...))` SHALL have `createModule(name, setup)`. It SHALL return a module with that `name` and `setup`, equal to what `createModule(name, setup)` from `nanoeffects/actions` returns. The context that `setup` receives SHALL have the fields that the event map of the bus gives to a task context, without a type argument written by the caller.

#### Scenario: The module has the name and the setup
- **WHEN** `const userModule = app.createModule("user", setup)` is called
- **THEN** `userModule.name` is `"user"` and `userModule.setup` is `setup`

#### Scenario: The context has the fields of the bus
- **WHEN** the bus has `WithContext<{ store }>` and `effectsPlugin({ race })`, and a handler registered in `app.createModule("user", (m) => m.on("loaded", (_, ctx) => …))` reads `ctx.store` and `ctx.race`
- **THEN** both are known to the type checker, and a field that the bus does not have is a type error

#### Scenario: The payload and result come from the command
- **WHEN** `m.handle(getUser, (id, ctx) => …)` is written in such a module and `getUser` was made as `createAction<Call<string, Promise<User>>>("user/get")`
- **THEN** `id` is a string and the handler must return `Promise<User>`
