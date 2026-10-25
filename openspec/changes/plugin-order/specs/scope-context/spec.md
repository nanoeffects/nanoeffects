## MODIFIED Requirements

### Requirement: Layers have a fixed precedence
For the same field name the value SHALL come from the strongest layer that sets it. `emit` is the strongest, then action / command / job, then module, then bus. Fields of the library (`signal`, `abort`, `emit`, `on`, `off`, `run`, `type`, `payload`) SHALL always win over any layer. A child task SHALL inherit the fields of its parent. `scopePlugin` SHALL give the same result whether it is used before or after `effectsPlugin` and `modulePlugin`.

#### Scenario: Command beats module and bus
- **WHEN** the bus, the module and the command all set `http`
- **THEN** the handler sees the `http` of the command

#### Scenario: Emit beats everything
- **WHEN** the command sets `http` and the call passes `{ http: fake }`
- **THEN** the handler sees `fake`

#### Scenario: Library fields cannot be replaced
- **WHEN** a scope sets `signal` or `emit`
- **THEN** the task context keeps the library's value

#### Scenario: Children inherit
- **WHEN** a handler calls `ctx.run(child)` or an effect such as `retry` makes an attempt
- **THEN** the child context has the same fields as the parent

#### Scenario: A scope beats effectsPlugin in either order
- **WHEN** a scope sets `delay` in `$effects` and the bus has `effectsPlugin({ delay })`, with the two plugins used in either order
- **THEN** the handler of that command sees the `delay` of the scope
