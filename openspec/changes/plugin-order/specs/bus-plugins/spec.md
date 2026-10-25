## MODIFIED Requirements

### Requirement: Modules are attached with a plugin
`bus.use(modulePlugin(modules?))` SHALL attach modules to the bus and return `mount`, `unmount`, `isMounted`, `dispose` and `commands`, with the behavior that `registerModules` had. The given modules SHALL be mounted in the order given on the first use of the app or of the bus, not inside `bus.use`: the first `bus.emit`, the first call of `mount`, `unmount`, `isMounted` or `dispose`, or the first read of `commands`. A module mounted by `mount` before that first use SHALL be mounted after the given modules. Between `bus.use(modulePlugin(...))` and the first use, `bus.on`, `bus.once` and `bus.off` SHALL be held and replayed in the order called right after the given modules are mounted, so the listeners of the modules stay ahead of the listeners registered after `bus.use`.

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
- **WHEN** `bus.use(modulePlugin([userModule]))` is called and nothing else has happened
- **THEN** `userModule` has not run its `setup`, and it runs before the first `bus.emit` delivers its event or before the first `app.mount`, whichever comes first

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
- **THEN** the initial modules never run, and `app.mount` throws afterwards

## ADDED Requirements

### Requirement: The app is a slot of the bus
`modulePlugin` SHALL set the app it returns as the field `bus.app`, so a plugin used before or after it can find it. The field SHALL belong to the type of the plugin (`WithApp`), not to `Bus`. `createBus` SHALL NOT set it, and its size SHALL NOT grow.

#### Scenario: The slot is the returned app
- **WHEN** `const app = bus.use(modulePlugin())`
- **THEN** `bus.app === app`

#### Scenario: No modulePlugin, no slot
- **WHEN** a bus never used `modulePlugin`
- **THEN** `bus.app` is `undefined`

### Requirement: Plugins work in any order
The plugins `contextPlugin`, `effectsPlugin`, `commandsPlugin`, `modulePlugin`, `scopePlugin`, `matchPlugin`, `emitterPlugin`, `reactPlugin` and `devPlugin` SHALL give the same result in every order in which they are used on a bus, including the order in which the listeners of one event are called.

#### Scenario: Every order of every pair passes
- **WHEN** every ordered pair of the plugins is used on a bus and the probe of each plugin runs
- **THEN** every probe passes, with no exception named for an order

#### Scenario: Random orders of all the plugins pass
- **WHEN** all the plugins are used in each of 300 random orders
- **THEN** every probe passes
