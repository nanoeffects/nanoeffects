# bus-plugins Specification

## Purpose
Give the bus one entry point for extensions, `bus.use(plugin)`, where a plugin is a function of the bus, and attach modules to a bus as such a plugin.

## Requirements

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
`bus.use(modulePlugin(modules?))` SHALL attach modules to the bus and return `mount`, `unmount`, `isMounted`, `dispose` and `commands`, with the behavior that `registerModules` had. The given modules SHALL be mounted in the order given, not inside `bus.use`: at the first use of the app or of the bus (the first `bus.emit`, the first call of `mount`, `unmount`, `isMounted` or `dispose`, or the first read of `commands`), or, when none comes first and the list is not empty, at the end of the synchronous block in which `bus.use` was called. A module mounted by `mount` before that SHALL be mounted after the given modules. Between `bus.use(modulePlugin(...))` and that start, `bus.on`, `bus.once` and `bus.off` SHALL be held and replayed in the order called right after the given modules are mounted, so the listeners of the modules stay ahead of the listeners registered after `bus.use`.

#### Scenario: Modules are mounted and returned api works
- **WHEN** `const app = bus.use(modulePlugin([userModule]))` is called and later `app.mount(orderModule)` and `app.unmount(userModule)`
- **THEN** `userModule` is mounted on the first use of the app or the bus, `orderModule` when mounted, and `userModule` is unmounted with everything it did

#### Scenario: No modules given
- **WHEN** `bus.use(modulePlugin())` is called
- **THEN** it returns the api with nothing mounted

#### Scenario: A module is replaced by name
- **WHEN** a module is mounted and a module of the same name is mounted through the returned `mount`
- **THEN** the first is unmounted before the second is mounted

#### Scenario: Initial modules wait for the first use
- **WHEN** `bus.use(modulePlugin([userModule]))` is called and nothing else has happened in the same synchronous block
- **THEN** `userModule` has not run its `setup` yet, and it runs before the first `bus.emit` delivers its event or before the first `app.mount`, or at the end of the block if neither comes first

#### Scenario: Initial modules mount without any use
- **WHEN** `bus.use(modulePlugin([userModule]))` is called and nothing uses the app or the bus
- **THEN** `userModule` has run its `setup` once after the current synchronous block has finished

#### Scenario: An earlier use starts it once
- **WHEN** the first `bus.emit` happens before the end of the block
- **THEN** `userModule` is mounted at that emit, and the scheduled start does not mount it again

#### Scenario: No initial modules schedule nothing
- **WHEN** `bus.use(modulePlugin())` or `bus.use(modulePlugin([]))` is called and nothing uses the app or the bus
- **THEN** nothing is mounted and the calls of `bus.on`, `bus.once` and `bus.off` are held as before until the first use

#### Scenario: A plugin used later in the same block is seen
- **WHEN** `bus.use(modulePlugin([userModule]))` is followed in the same synchronous block by `bus.use(contextPlugin({ store }))`
- **THEN** the context of `userModule` has `store`, although nothing used the bus

#### Scenario: A setup that throws at the scheduled start
- **WHEN** the `setup` of an initial module throws and nothing used the app before the end of the block
- **THEN** the error is reported, the modules of the list are not left mounted, the held listeners are replayed, and the app stays usable

#### Scenario: Module listeners stay ahead of the listeners registered after the plugin
- **WHEN** `bus.use(modulePlugin([userModule]))` is called, then `bus.on("ping", outside)`, then `bus.emit("ping")`, and `userModule` listens to `ping`
- **THEN** on `ping` the listener of `userModule` runs before `outside`

#### Scenario: A listener registered before the plugin stays first
- **WHEN** `bus.on("ping", early)` is called before `bus.use(modulePlugin([userModule]))`
- **THEN** `early` runs before the listener of `userModule`

#### Scenario: A held subscription can be removed
- **WHEN** `const off = bus.on("ping", outside)` is called after `bus.use(modulePlugin(...))`, and `off()` is called before and, in another run, after the first emit
- **THEN** `outside` never runs in either case

#### Scenario: A held once and off
- **WHEN** `bus.once("ping", outside)` is held and `bus.off("ping", outside)` is called before the first use
- **THEN** `outside` never runs

#### Scenario: Held calls are replayed in order
- **WHEN** `bus.on("ping", first)` and `bus.on("ping", second)` are called after `bus.use(modulePlugin(...))`
- **THEN** on `ping` `first` runs before `second`

#### Scenario: Plugins used after modulePlugin are seen by modules
- **WHEN** `bus.use(modulePlugin([userModule]))` is followed by `bus.use(contextPlugin({ store }))` and `bus.use(effectsPlugin({ race }))`, and then the bus is used
- **THEN** the context of `userModule` and of the tasks it spawns has `store` and `race`

#### Scenario: Disposed before the first use
- **WHEN** `app.dispose()` is the first use of the app
- **THEN** the initial modules never run, also at the end of the block, and `app.mount` throws afterwards

### Requirement: registerModules is gone
The package SHALL NOT export `registerModules`; attaching modules SHALL be done with `modulePlugin` and `bus.use`.

#### Scenario: The old function is not exported
- **WHEN** the entries of `nanoeffects/actions` are listed
- **THEN** `modulePlugin` is among them and `registerModules` is not

### Requirement: The app is a slot of the bus
`modulePlugin` SHALL set the app it returns as the field `bus.app`, so a plugin used before or after it can find it. The field SHALL belong to the type of the plugin (`WithApp`), not to `Bus`. `createBus` SHALL NOT set it, and its size SHALL NOT grow.

#### Scenario: The slot is the returned app
- **WHEN** `const app = bus.use(modulePlugin())`
- **THEN** `bus.app === app`

#### Scenario: No modulePlugin, no slot
- **WHEN** a bus never used `modulePlugin`
- **THEN** `bus.app` is `undefined`

### Requirement: Plugins work in any order
The plugins `contextPlugin`, `effectsPlugin`, `actionsPlugin`, `modulePlugin`, `scopePlugin`, `matchPlugin`, `emitterPlugin`, `reactPlugin` and `devPlugin` SHALL give the same result in every order in which they are used on a bus, including the order in which the listeners of one event are called.

#### Scenario: Every order of every pair passes
- **WHEN** every ordered pair of the plugins is used on a bus and the probe of each plugin runs
- **THEN** every probe passes, with no exception named for an order

#### Scenario: Random orders of all the plugins pass
- **WHEN** all the plugins are used in each of 300 random orders
- **THEN** every probe passes
