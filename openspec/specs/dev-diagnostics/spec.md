# dev-diagnostics Specification

## Purpose
Give a developer a signal during hot reload and development, listeners that pile up and modules that are replaced, from a separate entry that a production build does not carry.

## Requirements

### Requirement: Warn about listeners that pile up
`bus.use(devPlugin())` SHALL log one warning for an event when the number of listeners of that event exceeds `maxListeners` (default 10), naming the event and the count. A listener that is added with a predicate (`matchPlugin`) SHALL be counted under the event `"*"`, which is where it listens, whichever of the two plugins was used first, and SHALL be counted once.

#### Scenario: The limit is exceeded
- **WHEN** 11 listeners are added to the event `search` on a bus with the plugin and the limit is 10
- **THEN** one warning is logged that names `search` and the count 11, and adding a 12th listener logs nothing more for `search`

#### Scenario: Listeners that are removed do not count
- **WHEN** listeners are added and removed so that no more than 10 are present at once
- **THEN** nothing is logged

#### Scenario: The warning can come again
- **WHEN** the count of an event falls to the limit or below and later exceeds it again
- **THEN** a new warning is logged for that event

#### Scenario: Predicate subscriptions are counted under "*"
- **WHEN** 11 listeners are added with predicates on a bus with `devPlugin` and `matchPlugin`, used in either order
- **THEN** one warning is logged that names `"*"` and the count 11, and no warning names `undefined`

### Requirement: Report module mount, replacement and unmount
`devPlugin` SHALL log when a module is mounted through `app.mount`, when a mounted module of the same name is replaced, and when a module is unmounted. The app SHALL be the `app` option when it is given, else `bus.app`, whether `modulePlugin` was used before or after `devPlugin`. `disconnect` SHALL put `mount` and `unmount` back.

#### Scenario: A module is replaced by name
- **WHEN** a module named `user` is mounted and a new module named `user` is mounted through `app.mount`
- **THEN** a message that names `user` and says it was replaced is logged, and the replacement itself is unchanged

#### Scenario: A first mount and an unmount
- **WHEN** a module is mounted and later unmounted through the app
- **THEN** a message for the mount and a message for the unmount are logged

#### Scenario: devPlugin without the app option
- **WHEN** `bus.use(devPlugin())` is used before or after `bus.use(modulePlugin())` and a module is mounted through `app.mount`
- **THEN** the mount is logged

#### Scenario: Disconnect before the app exists
- **WHEN** `devPlugin()` is disconnected and `modulePlugin` is used afterwards
- **THEN** nothing is logged and `app.mount` is the original function

### Requirement: Diagnostics can be chosen and redirected
`devPlugin` SHALL take `maxListeners`, `leaks` and `modules` to tune or switch off each diagnostic, and `log` to receive the messages instead of the console.

#### Scenario: One diagnostic is off
- **WHEN** `bus.use(devPlugin({ app, leaks: false }))` is called
- **THEN** module messages are logged and listener counts are not checked

#### Scenario: Messages go to a custom function
- **WHEN** `log` is given
- **THEN** every message goes to it and nothing is written to the console

### Requirement: Disconnect restores the bus
The function that the plugin returns SHALL stop the diagnostics and restore `bus.on` and `app.mount` as they were before. If another plugin has wrapped `bus.on` since, that wrapper SHALL stay in place and keep working, and the diagnostics SHALL be off.

#### Scenario: After disconnect nothing is reported
- **WHEN** `disconnect()` is called and more than `maxListeners` listeners are added
- **THEN** no warning is logged and the listeners work as on a bus that was never connected

#### Scenario: A plugin used after devPlugin keeps working
- **WHEN** `matchPlugin` is used after `devPlugin` and `disconnect()` is called
- **THEN** `bus.on(predicate, handler)` still works, and no warning is logged

### Requirement: The diagnostics do not change behavior
A bus and an app with the plugin SHALL deliver events, unsubscribe and mount modules exactly as an unconnected one does; only messages are added.

#### Scenario: Listeners and unsubscribe work
- **WHEN** a listener is added on a bus with the plugin and its unsubscribe function is called
- **THEN** it receives events until then and not after

### Requirement: A production build carries no diagnostics
Under the `production` export condition `nanoeffects/dev` SHALL resolve to a build whose `devPlugin` takes the same arguments and returns a plugin that does nothing and returns a function that does nothing; it SHALL NOT wrap `bus.on` or `app.mount`.

#### Scenario: The entry is a no-op in production
- **WHEN** a bundle is built in production mode with Vite or webpack and `bus.use(devPlugin({ app }))` is called
- **THEN** the bundle holds none of the code that counts listeners or logs, and `bus.on` and `app.mount` are the original functions

#### Scenario: An unused entry is not in the bundle
- **WHEN** an app does not import `nanoeffects/dev`
- **THEN** its bundle has none of it, as for any other entry
