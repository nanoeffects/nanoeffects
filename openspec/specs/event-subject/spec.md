# event-subject Specification

## Purpose
Gives one event of a bus, or of an instance of a class from `extendBus`, as a Subject: an Observable of its payloads that can also push a payload back, as a class that can be extended. It lets code written for streams read and write the bus without a second wiring, and it adds nothing to a bus that does not use it.

## Requirements

### Requirement: Subject is an Observable of one event
`new Subject(source, event)` from `nanoeffects/observable` SHALL take any object with `on` and `emit` as `source`. It SHALL have `subscribe`, `next` and `[Symbol.observable]`. `subscribe` SHALL take a function or an object with `next`, SHALL run it with the payload of each later `event` of `source`, and SHALL return `{ unsubscribe }`. Each `subscribe` SHALL be an `on` of `source` of its own, and `unsubscribe()` SHALL remove it. `[Symbol.observable]()` SHALL return the subject itself.

#### Scenario: A subscriber gets the payloads
- **WHEN** `const subject = new Subject(bus, "typed")`, `subject.subscribe(listener)` and `bus.emit("typed", "a")` are called
- **THEN** `listener` runs with `"a"`

#### Scenario: A subscriber is an object with next
- **WHEN** `subject.subscribe({ next: listener })` is called and `typed` is emitted
- **THEN** `listener` runs with the payload

#### Scenario: unsubscribe ends one subscription
- **WHEN** two subscribers subscribed, one called `unsubscribe()`, and `typed` is emitted
- **THEN** only the other runs

#### Scenario: Events before subscribe are lost
- **WHEN** `typed` is emitted and then `subject.subscribe(listener)` is called
- **THEN** `listener` does not run for that event

### Requirement: next emits into the source
`subject.next(payload)` SHALL be `source.emit(event, payload)`, so every listener of `event` on the source runs, whoever added it, and the subscribers of the subject too. `next` SHALL work when taken off the subject and called without it. The subject SHALL have no `complete`, no `error` and no replay.

#### Scenario: next reaches the source and the subject
- **WHEN** a handler is added with `bus.on("typed", handler)`, a subscriber with `subject.subscribe(listener)`, and `subject.next("a")` is called
- **THEN** `handler` and `listener` both run with `"a"`

#### Scenario: next can be passed as a callback
- **WHEN** `const { next } = subject` and `next("a")` is called
- **THEN** it acts as `subject.next("a")`

#### Scenario: A late subscriber gets no old value
- **WHEN** `subject.next("a")` is called and then a subscriber subscribes
- **THEN** the subscriber does not run for `"a"`

### Requirement: Subject can be extended
A class that extends `Subject` SHALL be a subject: its instances SHALL be instances of `Subject` and of the subclass, and a method of the subclass SHALL replace the one of `Subject`. `next` taken off an instance SHALL call the replacing method.

#### Scenario: A subclass fixes the event
- **WHEN** `class Typed extends Subject { constructor(bus) { super(bus, "typed"); } }` and `new Typed(bus).next("a")` is called
- **THEN** `typed` is emitted on `bus` with `"a"`, and the instance is an instance of `Subject`

#### Scenario: A subclass overrides next
- **WHEN** a subclass defines `next(payload)` that calls `super.next(payload.trim())`, and `const { next } = instance` and `next(" a ")` are called
- **THEN** `typed` is emitted with `"a"`

### Requirement: A subject over an instance ends with the instance
When `source` is an instance of a class from `extendBus` or `@WithBus`, a subscription of the subject SHALL be one of that instance, as one made with its `on`, also when the subject is made in the constructor of the base class. `dispose()` and `[Symbol.dispose]()` of the instance SHALL remove it, and no subscription of another instance.

#### Scenario: dispose ends the subscription
- **WHEN** a subject over an instance is subscribed to, then `dispose()` of the instance is called and `typed` is emitted
- **THEN** the subscriber does not run

#### Scenario: Other instances are not touched
- **WHEN** two instances each have a subject subscribed to `typed` and one is disposed
- **THEN** the subscriber of the other instance still runs

#### Scenario: A subject in the constructor of Base is tracked
- **WHEN** the constructor of `Base` makes `new Subject(this, "typed")` and subscribes, and the instance is disposed
- **THEN** the subscriber no longer runs

### Requirement: The types follow the event map
`Subject` SHALL take the events of the type of its source, and `next` and the observer given to `subscribe` SHALL use the payload type of `event`. A bus, and an instance of a class from `extendBus` or `@WithBus` that has the methods of that bus, SHALL both fit as `source`.

#### Scenario: Wrong payload is a type error
- **WHEN** `typed` carries a string and `subject.next(1)` is written
- **THEN** the type checker reports an error

#### Scenario: An instance fits as a source
- **WHEN** `new Subject(this, "typed")` is written inside a class from `extendBus(bus, Base)` whose bus has the event `typed`
- **THEN** it type checks, and the payload type of `typed` is used

### Requirement: createObserve is unchanged
`createObserve(bus)(event)` SHALL keep its signature and its behavior, and the Observable it returns SHALL have no `next`.

#### Scenario: createObserve behaves as before
- **WHEN** `createObserve(bus)("typed")` is subscribed to and `typed` is emitted
- **THEN** the subscriber runs with the payload, and the result has no `next`
