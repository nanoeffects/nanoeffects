## MODIFIED Requirements

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
