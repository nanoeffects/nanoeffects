# Design: emitterPlugin

## Context

A state manager calls back with its new value: `$name.listen(cb)`, `reaction(expr, cb)`, `subscribeKey(state, "name", cb)`. The bus turns a value into an event with `bus.emit(creator(value))`. The only thing missing is the callback. `createAction` is not tied to a bus (it is reused on several buses and in tests) and `bus.emit` overloads already accept a creator and an action.

## Decisions

**1. A plugin, not a method of `createBus`.** Not every app uses a state manager, and `createBus` stays about 1.3 kB. `emitterPlugin()` lives in `nanoeffects/actions` next to `createAction`, so it adds nothing to the bus entry. It uses only the public `bus.emit`, so no new slot on `Bus` (no `addContext`-like hook).

**2. The plugin adds the method on the bus object** (`Object.assign(bus, { emitter })`) and returns the same bus typed `Bus<E> & EmitterApi<E>`. This follows the "refining plugin" rule of `effectsPlugin`: one binding, `const bus = createBus().use(emitterPlugin())`.

**3. Creators are not bound to a bus.** A bound action (`bus.action("x")` where calling emits) was rejected: `bus.emit(nameChanged(x))` would emit twice or emit the wrong value, so a bus with and without the plugin would need two kinds of documentation. The emitter is a separate function that wraps the creator and leaves it unchanged.

**4. Overloads.** As in `On`, the free creator goes first:

```ts
emitter<K extends EventKey<E>>(creator: FreeActionCreator<K>): (...payload: PayloadOf<E[K]>) => void;
emitter<P, T extends string, A extends unknown[]>(creator: ActionCreator<P, T, A>): (...args: A) => void;
```

The implementation is written as overloaded `function` declarations so the arguments are checked by the overloads and passed on without a cast inside a call (the readability lint forbids that). One cast remains: the built action to `EventLike<E>`, on its own line.

**5. All arguments are forwarded to the creator.** A state manager may pass more than the value (`(value, previous)` in Zustand with `subscribeWithSelector`, MobX `reaction`). A creator without `prepare` reads only the first argument, so the extra one is ignored; a creator with `prepare` gets all of them. The emitter does not select, compare or drop values: atomic stores already notify on change only. Zustand without `subscribeWithSelector` and Redux notify on every change, so the docs show the selector form for Zustand and `createEffectsMiddleware` for Redux. Jotai's `sub` passes no value, so its recipe stays an arrow around the emitter.

**6. Name `emitter`.** The result is a function, so a noun fits next to `bus.commands`. `createEmitter` was shorter to argue for but longer to write; `createReaction` clashes with MobX `reaction`; `bind` clashes with the bindings of `commandsPlugin`.

**7. `bus.emit(creator, payload)`.** At run time `eventKey` reads `event.type` of any function and the payload from the second argument, so the form works. The task list checks that the types accept it for action creators and adds a type test; if they do not, the fix is an overload of `Emit` and not a new method. This form is not the way to make a callback: `bind` on an overloaded function loses the payload check.

## Risks

- `emitter` is a second property the bus object gets from a plugin; a bus that already has a field with that name is overwritten. The plugin is called once per bus, and the name is reserved by this design.
- Users may expect the emitter to compare values. The docs say that it does not and show the stores that need a selector.

## Migration

Additive. Hand-written arrows keep working.
