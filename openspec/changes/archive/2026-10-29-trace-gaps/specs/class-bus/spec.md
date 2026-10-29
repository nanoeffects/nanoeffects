# Spec Delta

## MODIFIED Requirements

### Requirement: Method decorators subscribe the methods of an instance
`@On(event, wrap?, options?)` and `@Once(event, wrap?, options?)` SHALL make the decorated method a handler of `event` for each instance of a class made by `extendBus` or `@WithBus`, subscribed when the instance is constructed (after the constructor of `Base` has run) through the `on` and `once` of the instance. The method SHALL be called with `this` bound to the instance and with the payload and the task context of the event. `event` is an event name, an action creator or a command, as for `on`. `wrap`, if given, SHALL be a function that takes the bound handler and returns the handler to subscribe, such as `latest` or `(handler) => debounce(300, handler)`. The second argument MAY be the `options` instead of `wrap` when it is an object: `{ traceId }` SHALL be given on to the `on` or `once` of the instance as the options of `bus.on`, and has an effect only with `tracePlugin` (see `trace-plugin`). These subscriptions SHALL be the subscriptions of the instance: `dispose()` removes them. A subclass SHALL inherit them, and a method that a subclass overrides SHALL be subscribed only if the override is decorated. The decorators SHALL work for decorators of the language and for `experimentalDecorators`. On a class that is not made by `extendBus` or `@WithBus` they SHALL do nothing.

#### Scenario: A decorated method is a handler with this bound
- **WHEN** a method is decorated with `@On("ping")`, an instance is made, and `ping` is emitted with `1`
- **THEN** the method runs once, on the instance, with `1` and the task context

#### Scenario: Each instance has its own subscription
- **WHEN** two instances of the class are made and `ping` is emitted
- **THEN** the method runs for each instance, on that instance

#### Scenario: Once runs one time
- **WHEN** a method is decorated with `@Once("ping")` and `ping` is emitted twice
- **THEN** the method runs once

#### Scenario: A policy in wrap
- **WHEN** a method is decorated with `@On("ping", latest)` and two `ping` events come while the first run waits
- **THEN** the first run is aborted by the second

#### Scenario: dispose ends them
- **WHEN** an instance is disposed and `ping` is emitted
- **THEN** the decorated method does not run for it

#### Scenario: An action creator and a command as the event
- **WHEN** a method is decorated with `@On(userLoaded)`, where `userLoaded` is an action creator
- **THEN** it runs for that action and the payload is typed as the payload of the creator

#### Scenario: Inherited and overridden
- **WHEN** a subclass of the decorated class does not override the method, and another subclass overrides it without a decorator
- **THEN** the first subscribes the inherited method and the second does not subscribe the override

#### Scenario: Both kinds of decorators
- **WHEN** the same class is written with decorators of the language and with `experimentalDecorators`
- **THEN** the subscriptions are the same

#### Scenario: Not a class of the entry
- **WHEN** a class that is not made by `extendBus` or `@WithBus` has a method decorated with `@On("ping")`
- **THEN** nothing is subscribed and nothing is thrown

#### Scenario: A named decorated method
- **WHEN** a method is decorated with `@On("ping", { traceId: "pinger" })` and the bus has a tracer and `tracePlugin`
- **THEN** each call of the method is a task named `pinger`, and the method runs as without the option

#### Scenario: A policy and a name
- **WHEN** a method is decorated with `@On("ping", latest, { traceId: "pinger" })`
- **THEN** `latest` wraps the method and the listener is named
