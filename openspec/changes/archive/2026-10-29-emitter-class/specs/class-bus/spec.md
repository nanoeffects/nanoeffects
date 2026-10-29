# Spec Delta

## MODIFIED Requirements

### Requirement: The bus is optional and belongs to the class
`extendBus(Base)` SHALL make a bus with `createBus()` for the returned class. The instances of one class SHALL share its bus, two classes SHALL have two buses, and the bus SHALL be the static property `bus` of the class and the property `bus` of its instances. When a bus is passed, that bus SHALL be used. `extendBus(bus)` with no class SHALL return a class over an empty base that uses `bus`, so that `class Service extends extendBus(bus) {}` has the methods of `bus`. A bus SHALL be told from a class by being a function or not.

#### Scenario: Instances share the bus of their class
- **WHEN** `const Service = extendBus(Base)` and two instances are made, and one calls `emit("ping", 1)`
- **THEN** a handler added by the other with `on("ping", …)` runs, and `Service.bus` is that bus

#### Scenario: Two classes, two buses
- **WHEN** `extendBus(BaseA)` and `extendBus(BaseB)` are called
- **THEN** an event emitted by an instance of one does not reach a handler of the other

#### Scenario: A bus that is passed is used
- **WHEN** `extendBus(bus, Base)` is called
- **THEN** `Service.bus === bus`

#### Scenario: A bus with no class
- **WHEN** `class Service extends extendBus(bus) {}` and `new Service()` are written
- **THEN** the instance has `on`, `once`, `off`, `emit` and `dispose` that act on `bus`, `Service.bus === bus`, and the methods of the plugins used on `bus` before are there

#### Scenario: A class with no bus is unchanged
- **WHEN** `extendBus(Base)` is called with a class
- **THEN** the class gets a bus of its own, as before

## ADDED Requirements

### Requirement: Emitter is a base class with a bus for each instance
`Emitter<E>` from `nanoeffects/oop` SHALL be a class that can be extended. Its instances SHALL have `on`, `once`, `off` and `emit` that act on the bus of that instance, `dispose()` and `[Symbol.dispose]()`, and the property `bus`. A member of the subclass with the name of one of these SHALL be kept and not replaced.

#### Scenario: A subclass has the methods
- **WHEN** `class VideoService extends Emitter {}` and `const service = new VideoService()`, then `service.on("ping", handler)` and `service.emit("ping", 1)`
- **THEN** `handler` runs with `1` and a task context

#### Scenario: Own member is kept
- **WHEN** a subclass has a method `emit` or `dispose`
- **THEN** an instance calls that method

### Requirement: Subscriptions of an Emitter belong to the instance
A subscription made through `this.on` or `this.once` of an `Emitter` instance SHALL be remembered for that instance, also when it is made in the constructor of a subclass. `dispose()` and `[Symbol.dispose]()` SHALL remove every subscription of that instance and no other, and SHALL do nothing when called again, as for a class from `extendBus`. A `Subject` made over the instance SHALL be ended the same way.

#### Scenario: dispose ends the subscriptions of the instance
- **WHEN** an instance subscribed to two events, `dispose()` is called, and both events are emitted
- **THEN** neither handler runs, and a subscription of another instance still runs

#### Scenario: A subscription in a constructor is tracked
- **WHEN** the constructor of a subclass calls `this.on(…)` and the instance is disposed
- **THEN** that handler no longer runs

#### Scenario: Symbol.dispose is the same
- **WHEN** `instance[Symbol.dispose]()` is called
- **THEN** the subscriptions are removed as by `dispose()`

#### Scenario: dispose can be called twice
- **WHEN** `dispose()` is called two times
- **THEN** the second call does nothing and does not throw

### Requirement: Each instance of Emitter has a bus of its own
Each instance of an `Emitter` subclass SHALL have a bus of its own, made the first time the instance uses `on`, `once`, `off`, `emit` or `bus`, also in the constructor of a parent class, and kept for the life of the instance. `bus` of an instance SHALL be that bus. An event emitted by one instance SHALL not reach a handler of another instance, whether they are of the same class, of two classes, or of a class and its subclass. There SHALL be no static `bus`.

#### Scenario: Two instances do not hear each other
- **WHEN** two instances of `VideoService` are made, the first adds `on("ping", handler)`, and the second calls `emit("ping", 1)`
- **THEN** `handler` does not run, and it runs when the first instance calls `emit("ping", 1)`

#### Scenario: A class and its subclass are independent
- **WHEN** `class Child extends Parent {}` and an instance of each add a handler and emit `ping`
- **THEN** each handler runs only for the emit of its own instance

#### Scenario: The bus is the same on every read
- **WHEN** `service.bus` is read two times
- **THEN** both reads are the same object, and it is not the `bus` of another instance

#### Scenario: A bus in a parent constructor
- **WHEN** the constructor of a parent class calls `this.on(…)` before the fields of the subclass exist
- **THEN** the subscription is on the bus of that instance, and `service.emit(…)` reaches it

#### Scenario: A shared bus is a class from extendBus
- **WHEN** two instances of `class Service extends extendBus(bus) {}` are made
- **THEN** they share `bus`, and an event of one reaches a handler of the other

### Requirement: Emitter has no methods of plugins
An `Emitter` subclass SHALL have the methods of a bus made with `createBus()` and no others. A class that needs a bus that its instances share, or the methods of plugins, SHALL use `extendBus(bus, Base)` or `extendBus(bus)`.

#### Scenario: A plugin method is not there
- **WHEN** a plugin that adds a method is used on `service.bus` after it is made
- **THEN** the instances do not have that method, as the methods of plugins used after `extendBus` are not on its class

### Requirement: Decorators work on a subclass of Emitter
`@On` and `@Once` SHALL make a decorated method of an `Emitter` subclass a handler of the event for each instance, with `this` bound to the instance, as for a class from `extendBus`. The subscription SHALL be made when the constructor of `Emitter` runs, before the constructor body and the fields of the subclass, and `dispose()` SHALL remove it.

#### Scenario: A decorated method is a handler
- **WHEN** a method of an `Emitter` subclass is decorated with `@On("ping")`, an instance is made and `ping` is emitted with `1`
- **THEN** the method runs on the instance with `1` and the task context

#### Scenario: dispose ends it
- **WHEN** the instance is disposed and `ping` is emitted
- **THEN** the method does not run for it

### Requirement: The types of Emitter follow its event map
`Emitter<E>` SHALL type `on`, `once`, `off` and `emit` of its instances by the event map `E`, and the property `bus` of an instance as the bus of `E`, with no loose static type beside it. Without `E` the events SHALL be free. An instance SHALL be usable where an object with the `on` and `emit` of a bus is wanted. `extendBus(bus)` SHALL return a class whose instances are typed as `BusMethods<typeof bus>`.

#### Scenario: Payloads are checked
- **WHEN** `VideoService extends Emitter<{ "video/time": number }>` and `service.emit("video/time", "a")` is written
- **THEN** the type checker reports an error

#### Scenario: A handler is typed
- **WHEN** `service.on("video/time", (seconds) => …)` is written
- **THEN** `seconds` is a `number`

#### Scenario: A bus with no class is typed
- **WHEN** `class Service extends extendBus(bus) {}` is written for a bus with plugins
- **THEN** the instance has the methods of `BusMethods<typeof bus>`

### Requirement: The docs show Emitter and extendBus with no class
The documentation SHALL describe `Emitter` first for a service whose every instance has a bus of its own and `extendBus(bus)` for a bus that instances share, SHALL correct the note that a bus for each instance is not part of the entry, with type-checked examples, SHALL name that `Emitter` has no methods of plugins, and SHALL point to `Subject` in the Observable page for a stream of an event.

#### Scenario: Examples are checked
- **WHEN** `pnpm docs:check` runs
- **THEN** every code block about `Emitter` and `extendBus(bus)` type-checks against the source
