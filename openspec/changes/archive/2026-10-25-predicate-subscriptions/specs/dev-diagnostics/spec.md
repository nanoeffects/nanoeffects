## MODIFIED Requirements

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

### Requirement: Disconnect restores the bus
The function that the plugin returns SHALL stop the diagnostics and restore `bus.on` and `app.mount` as they were before. If another plugin has wrapped `bus.on` since, that wrapper SHALL stay in place and keep working, and the diagnostics SHALL be off.

#### Scenario: After disconnect nothing is reported
- **WHEN** `disconnect()` is called and more than `maxListeners` listeners are added
- **THEN** no warning is logged and the listeners work as on a bus that was never connected

#### Scenario: A plugin used after devPlugin keeps working
- **WHEN** `matchPlugin` is used after `devPlugin` and `disconnect()` is called
- **THEN** `bus.on(predicate, handler)` still works, and no warning is logged
