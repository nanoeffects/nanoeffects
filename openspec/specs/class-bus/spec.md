# class-bus Specification

## Purpose
Gives a class the methods of a bus and ties the subscriptions made through an instance to that instance, so that ending the object ends its subscriptions. It is a function of a bus, not a plugin: a bus that is not passed to it is unchanged.

## Requirements

### Requirement: extendBus returns a subclass with the methods of the bus
`extendBus(bus, Base)` SHALL return a class that extends `Base`. `new Extended(...args)` SHALL call the constructor of `Base` with `args`. The class SHALL have the name of `Base`, and its instances SHALL be instances of `Base`. Its instances SHALL have `on`, `once`, `off` and `emit` that act on `bus`, and the other function members of the bus that plugins added before the call, except the slots of the bus (`ctx`, `commands`, `trace`, `addContext`, `applyScope`, `fitScope`, `app`, `use`).

#### Scenario: A subclass of the base
- **WHEN** `const Service = extendBus(bus, Base)` and `const service = new Service(1, 2)`
- **THEN** `service instanceof Base`, `Service.name === Base.name`, and the constructor of `Base` got `1, 2`

#### Scenario: The methods act on the bus
- **WHEN** `service.on("ping", handler)` and `service.emit("ping", 1)` are called
- **THEN** `handler` runs with `1` and a task context, as with `bus.on` and `bus.emit`

#### Scenario: Methods of plugins used before are there
- **WHEN** `emitterPlugin` was used on the bus before `extendBus`
- **THEN** an instance has `emitter`

#### Scenario: Methods of plugins used after are not there
- **WHEN** a plugin that adds a method is used on the bus after `extendBus`
- **THEN** the instances of the class do not have that method

#### Scenario: The methods can be destructured
- **WHEN** `const { emit } = service` and `emit("ping", 1)` is called
- **THEN** it acts on the bus as `service.emit("ping", 1)` does

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

### Requirement: Subscriptions belong to the instance
A subscription made with `this.on` or `this.once` SHALL be remembered for that instance, also when it is made in the constructor of `Base`. `dispose()` and `[Symbol.dispose]()` of the instance SHALL remove every subscription made through that instance and no other, and SHALL do nothing when called again. A subscription that its own unsubscribe function, `this.off` or a `once` that has fired removed SHALL not be remembered any more. `emit` SHALL remember nothing. A subscription with a predicate (`matchPlugin`) SHALL be treated the same way.

#### Scenario: dispose removes the subscriptions of the instance
- **WHEN** an instance subscribed to two events with `this.on` and `dispose()` is called, then both events are emitted
- **THEN** neither handler runs

#### Scenario: Other instances and other subscribers are not touched
- **WHEN** two instances subscribed and one is disposed, and the bus has a subscriber of its own
- **THEN** the handlers of the other instance and of the subscriber still run

#### Scenario: A subscription in the constructor of Base is tracked
- **WHEN** the constructor of `Base` calls `this.on(…)` and the instance is disposed
- **THEN** that handler no longer runs

#### Scenario: dispose can be called twice
- **WHEN** `dispose()` is called two times
- **THEN** the second call does nothing and does not throw

#### Scenario: Symbol.dispose is the same
- **WHEN** `instance[Symbol.dispose]()` is called
- **THEN** the subscriptions are removed as by `dispose()`

#### Scenario: A once that fired is forgotten
- **WHEN** `this.once(event, handler)` has fired
- **THEN** the instance holds nothing for it, and `dispose()` has nothing to remove for it

#### Scenario: off forgets
- **WHEN** `this.off(event, handler)` is called for a subscription of the instance
- **THEN** it is removed and `dispose()` has nothing to remove for it

#### Scenario: A predicate subscription is tracked
- **WHEN** `matchPlugin` was used and an instance subscribed with `this.on(predicate, handler)`
- **THEN** `dispose()` removes it

### Requirement: The class of the user wins a clash of names
A member is added to the returned class only if its name is not a member of `Base` or of a class that `Base` extends. This SHALL hold for `on`, `once`, `off`, `emit`, the methods of plugins, `dispose`, `[Symbol.dispose]`, `bus`. `disposeBus(instance)` SHALL remove the subscriptions of an instance of a class made by `extendBus`, and SHALL do nothing for any other value.

#### Scenario: Own emit is kept
- **WHEN** `Base` has a method `emit`
- **THEN** an instance of the extended class calls the `emit` of `Base`

#### Scenario: Own dispose is kept, and disposeBus ends the subscriptions
- **WHEN** `Base` has a `dispose` that calls `disposeBus(this)`
- **THEN** `instance.dispose()` runs the code of `Base` and the subscriptions of the instance are removed

#### Scenario: disposeBus of something else
- **WHEN** `disposeBus` is called with an object that is not an instance of such a class
- **THEN** nothing happens and nothing is thrown

### Requirement: Handlers given by hand keep the this they are given
A handler passed to `this.on` or `this.once` SHALL be called as the bus calls it, with no `this` of the instance. A method passed bare, `this.on(event, this.handle)`, SHALL lose `this` as it does in plain JavaScript; an arrow function or an arrow field keeps it.

#### Scenario: An arrow keeps this
- **WHEN** `this.on(event, (payload, ctx) => this.handle(payload, ctx))` is used
- **THEN** `handle` runs on the instance

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

### Requirement: A decorator does the same as extendBus
`WithBus(bus?)` SHALL return a class decorator. `@WithBus(bus) class A {}` SHALL replace `A` by `extendBus(bus, A)`, and `@WithBus() class A {}` by `extendBus(A)`. It SHALL work for decorators of the language and for `experimentalDecorators`.

#### Scenario: A decorated class has the methods
- **WHEN** a class is decorated with `@WithBus(bus)`
- **THEN** its instances have `on`, `emit` and `dispose`, and behave as those of `extendBus(bus, Base)`

#### Scenario: A decorator with no bus
- **WHEN** a class is decorated with `@WithBus()`
- **THEN** it has a bus of its own, as `extendBus(Base)` makes

### Requirement: The types follow the bus
`extendBus` SHALL return a class whose constructor takes the arguments of the constructor of `Base` and whose instances are typed as `Base` and `BusMethods<typeof bus>`. `BusMethods<B>` SHALL be the function members of `B` that an instance gets, with `dispose(): void`, `[Symbol.dispose](): void` and `readonly bus: B`. A member of `Base` with the name of a bus method SHALL keep its own type. A class can declare what it uses with `declare on: BusMethods<typeof bus>["on"]`, and a decorated class with `interface Name extends BusMethods<typeof bus> {}`.

#### Scenario: The instance is typed
- **WHEN** `const service = new (extendBus(bus, Base))()` is written in TypeScript
- **THEN** `service.on`, `service.emit` and `service.dispose` are typed, as the methods of a plugin are when the bus has the plugin

#### Scenario: The constructor keeps its parameters
- **WHEN** the constructor of `Base` takes `(name: string)`
- **THEN** `new Extended()` is an error and `new Extended("a")` is not

#### Scenario: Own member keeps its type
- **WHEN** `Base` declares `emit(text: string): void`
- **THEN** the instance has that type for `emit`

### Requirement: The class entry costs the core nothing and does not leak
`createBus` SHALL not import `nanoeffects/oop`, and its size SHALL not grow. A disposed instance and its handlers SHALL be collectable.

#### Scenario: The core does not grow
- **WHEN** `createBus` is bundled alone before and after the change
- **THEN** the size is the same

#### Scenario: A disposed instance is collectable
- **WHEN** many instances subscribe and are disposed and no reference to them is kept
- **THEN** a `WeakRef` to each is cleared after `global.gc`

### Requirement: The docs show the class entry
The documentation SHALL describe `extendBus`, `WithBus` and `disposeBus` with type-checked examples that keep the bus, the events and the class in separate files, and SHALL name what is not done (no binding of `this`, no methods of plugins used later).

#### Scenario: Examples are checked
- **WHEN** `pnpm docs:check` runs
- **THEN** every code block about the class entry type-checks against the source

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
