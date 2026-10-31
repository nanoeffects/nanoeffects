## MODIFIED Requirements

### Requirement: Plugins work in any order
The plugins `contextPlugin`, `effectsPlugin`, `actionsPlugin`, `modulePlugin`, `scopePlugin`, `matchPlugin`, `emitterPlugin`, `reactPlugin` and `devPlugin` SHALL give the same result in every order in which they are used on a bus, including the order in which the listeners of one event are called.

#### Scenario: Every order of every pair passes
- **WHEN** every ordered pair of the plugins is used on a bus and the probe of each plugin runs
- **THEN** every probe passes, with no exception named for an order

#### Scenario: Random orders of all the plugins pass
- **WHEN** all the plugins are used in each of 300 random orders
- **THEN** every probe passes
