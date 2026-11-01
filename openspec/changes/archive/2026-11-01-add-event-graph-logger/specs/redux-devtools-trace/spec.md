## ADDED Requirements

### Requirement: The payload and the error are made plain before the extension gets them
`reduxDevtools` SHALL make the payload and the error of each action plain data before it hands the action to the extension, so that `JSON.stringify` of every action works for any payload, also a circular object, a `Map`, a class instance, a function, a bigint or an object whose properties throw. An `Error` SHALL still be sent as its message. The option `serialize` SHALL replace this with a function of the value, and `serialize: false` SHALL send values as they are, leaving the work to the extension. Before this change the payload was passed as it was, and a payload that could not be serialized was reported through the failure path of the logger and not shown; now it is shown in plain form.

#### Scenario: A circular payload is shown
- **WHEN** the payload is a circular object and `payload` is `"essential"` or `"all"`
- **THEN** the action the extension gets has a payload with `"[Circular]"` where the cycle is, and the handler and the emit run as without the logger

#### Scenario: A bigint payload is shown
- **WHEN** the payload is `10n`
- **THEN** the action has `"10n"` as the payload and nothing is reported as a failure

#### Scenario: Your own function
- **WHEN** `serialize` is a function
- **THEN** the payload of the action is what it returns

#### Scenario: Values as they are
- **WHEN** `serialize` is `false`
- **THEN** the payload of the action is the same object the handler got
