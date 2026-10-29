## ADDED Requirements

### Requirement: Report each module of a call with several
When `app.mount` or `app.unmount` is called with several modules, `devPlugin` SHALL log the mount, the replacement and the unmount of each module as it does for a single module, and the order, the rollback and the returned function SHALL be those of a plain `app.mount` of a list. `disconnect` SHALL put the original functions back.

#### Scenario: Several modules are logged one by one
- **WHEN** `app.mount(a, b)` is called with `devPlugin()` used
- **THEN** a message for the mount of `a` and a message for the mount of `b` are logged, in that order

#### Scenario: Unmount several
- **WHEN** the returned function of that call is called
- **THEN** the unmount of `b` and then of `a` is logged
