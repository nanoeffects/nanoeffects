## ADDED Requirements

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

#### Scenario: Off, disconnected and production
- **WHEN** `abandoned: false` is set, or the plugin is disconnected, or the production build is used
- **THEN** nothing is reported and `bus.addContext` is as it was
