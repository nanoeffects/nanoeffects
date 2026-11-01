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
