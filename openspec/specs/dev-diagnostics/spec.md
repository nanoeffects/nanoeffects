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

### Requirement: Report each module of a call with several
When `app.mount` or `app.unmount` is called with several modules, `devPlugin` SHALL log the mount, the replacement and the unmount of each module as it does for a single module, and the order, the rollback and the returned function SHALL be those of a plain `app.mount` of a list. `disconnect` SHALL put the original functions back.

#### Scenario: Several modules are logged one by one
- **WHEN** `app.mount(a, b)` is called with `devPlugin()` used
- **THEN** a message for the mount of `a` and a message for the mount of `b` are logged, in that order

#### Scenario: Unmount several
- **WHEN** the returned function of that call is called
- **THEN** the unmount of `b` and then of `a` is logged

### Requirement: devPlugin can record where a listener was made
With `devPlugin` used, the bus SHALL keep one call site for each subscription made with `on` and `once`, so `graphLogger` can show it. The record SHALL cost one capture when the subscription is made and nothing when it is called, SHALL be dropped when the subscription is removed, and SHALL be absent from the production build of `nanoeffects/dev`.

#### Scenario: A site for a subscription
- **WHEN** `bus.on("a", handler)` is called from `cart.js` line 12 with `devPlugin` used
- **THEN** the site `cart.js:12` is available for that subscription

#### Scenario: Removed
- **WHEN** the subscription is removed with its unsubscribe function or `off`
- **THEN** its site is dropped

#### Scenario: Production
- **WHEN** the `production` export condition resolves `nanoeffects/dev`
- **THEN** no site is recorded and nothing throws

### Requirement: devPlugin warns about a handler that ignores the signal
With `devPlugin` used, the bus SHALL warn once for each pair of handler type and event when a handler emits through `ctx.emit`, or subscribes through `ctx.on`, after the signal of its task aborted, because the bus drops that emit or subscription. The warning SHALL name the handler and the event and SHALL say to pass `ctx.signal` to the request or `ctx` to an effect. The emit that `createJob` makes for its own `cancel` SHALL NOT be reported. `abandoned: false` SHALL turn the check off, `disconnect` SHALL stop it, the production build SHALL do nothing, and the policies and the bus SHALL carry no code for it.

#### Scenario: A latest handler that ignores the signal
- **WHEN** a handler under `latest` awaits a request that ignores `ctx.signal`, a newer call aborts it, and it then emits `results`
- **THEN** one warning names the handler and `results`, and the emit is dropped as before

#### Scenario: ctx.on after the abort
- **WHEN** a handler under `latest` calls `ctx.on` after a newer call aborted it
- **THEN** one warning names the handler and the event, and says the subscription was dropped

#### Scenario: A handler that stops with its signal
- **WHEN** the handler checks `ctx.signal.aborted` and does not emit after an abort
- **THEN** nothing is reported

#### Scenario: A task that was not aborted
- **WHEN** a handler emits after a call that nothing aborted
- **THEN** nothing is reported

#### Scenario: createJob cancel
- **WHEN** `createJob` emits its `cancel` for an aborted call
- **THEN** nothing is reported

#### Scenario: A test counts what was lost
- **WHEN** a test cancels a handler that emits after the cancel and calls `getLostSignalsCount(bus, { wait })`
- **THEN** it resolves with the number of such emits and `ctx.on` calls, every one counted though the warning is written once, and `getLostSignals(bus)` lists `{ kind, handler, event }` for each

#### Scenario: No tracking on the bus
- **WHEN** `getLostSignalsCount` is called on a bus with no `devPlugin`, or with `abandoned: false`
- **THEN** it rejects with a message that says to use `devPlugin`

#### Scenario: Off, disconnected and production
- **WHEN** `abandoned: false` is set, or the plugin is disconnected, or the production build is used
- **THEN** nothing is reported and `bus.addContext` is as it was

### Requirement: devPlugin follows the requests of a handler
On Node (where `AsyncLocalStorage` is available), `devPlugin` SHALL attribute each `fetch` request to the task that made it, also after `await`, and SHALL count a request as a lost signal of kind `request` when its task is aborted while the request is still running and the request did not stop: it got no signal, or a signal that did not abort. A request that finished before the abort, or that stopped with the abort, SHALL NOT be counted. The lost signal SHALL name the handler and the url, `getLostSignalsCount` SHALL include it, and one warning SHALL be written for each handler and url. A request that starts after its task was already aborted SHALL be counted the same way. The option `requests: false` SHALL turn the tracking off, and `disconnect` SHALL put `fetch` back. Where `AsyncLocalStorage` is not available (a browser), nothing SHALL be tracked and nothing SHALL fail.

#### Scenario: A request without a signal
- **WHEN** a handler under `latest` calls `fetch(url)` with no signal and a newer call cancels it
- **THEN** `getLostSignalsCount(bus)` counts one lost signal of kind `request` with the url

#### Scenario: A request with the signal of the task
- **WHEN** the handler calls `fetch(url, { signal: ctx.signal })`
- **THEN** nothing is counted

#### Scenario: A signal that is not the task's
- **WHEN** the handler calls `fetch` with the signal of an `AbortController` of its own
- **THEN** the request is counted

#### Scenario: A request that already finished
- **WHEN** the request finished before the cancel
- **THEN** it is not counted

#### Scenario: The caller's own requests
- **WHEN** test code calls `fetch` after `bus.emit` returned
- **THEN** that request is not attributed to a task

#### Scenario: Off and disconnected
- **WHEN** `requests: false` is set, or the plugin is disconnected
- **THEN** nothing is counted and `fetch` is the function it was before
