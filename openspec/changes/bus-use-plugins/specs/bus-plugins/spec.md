# Spec Delta

## Purpose
Give the bus one entry point for extensions, `bus.use(plugin)`, where a plugin is a function of the bus, and attach modules to a bus as such a plugin.

## ADDED Requirements

### Requirement: use calls a plugin with the bus
`bus.use(plugin)` SHALL call `plugin` once, at once, with the bus as its only argument, and SHALL return what the plugin returns.

#### Scenario: A plugin gets the bus and its result is returned
- **WHEN** `const result = bus.use((b) => ({ same: b === bus }))` is called
- **THEN** `result` is `{ same: true }`

#### Scenario: A plugin can use the bus
- **WHEN** a plugin subscribes with `b.on("greet", fn)` and returns the unsubscribe function
- **THEN** `fn` receives `greet` events until the returned function is called

### Requirement: A plugin is only a function
A plugin SHALL be any function of the bus; the bus SHALL NOT keep a list of plugins, order them, or merge their results, and an error that a plugin throws SHALL come out of `use`.

#### Scenario: An error of a plugin
- **WHEN** a plugin throws an error
- **THEN** `bus.use(plugin)` throws that error

#### Scenario: Plugins run in the order they are used
- **WHEN** `bus.use(a)` is called and then `bus.use(b)`
- **THEN** `a` has run before `b` starts

### Requirement: Modules are attached with a plugin
`bus.use(modulePlugin(modules?))` SHALL attach modules to the bus, mount the given modules at once in the order given, and return `mount`, `unmount`, `isMounted`, `dispose` and `commands`, with the behavior that `registerModules` had.

#### Scenario: Modules are mounted and returned api works
- **WHEN** `const app = bus.use(modulePlugin([userModule]))` is called and later `app.mount(orderModule)` and `app.unmount(userModule)`
- **THEN** `userModule` is mounted at once, `orderModule` when mounted, and `userModule` is unmounted with everything it did

#### Scenario: No modules given
- **WHEN** `bus.use(modulePlugin())` is called
- **THEN** it returns the api with nothing mounted

#### Scenario: A module is replaced by name
- **WHEN** a module is mounted and a module of the same name is mounted through the returned `mount`
- **THEN** the first is unmounted before the second is mounted

### Requirement: registerModules is gone
The package SHALL NOT export `registerModules`; attaching modules SHALL be done with `modulePlugin` and `bus.use`.

#### Scenario: The old function is not exported
- **WHEN** the entries of `nanoeffects/actions` are listed
- **THEN** `modulePlugin` is among them and `registerModules` is not
