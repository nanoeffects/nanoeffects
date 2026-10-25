# Documentation

## Start here

The [Guide](guide.md) is the ladder: small bus → policies for async UI → effects when you need them → commands and modules for domain logic off the UI.

Code for every guide step: [`examples/guide.ts`](../examples/guide.ts) (type-checked and tested).

## Jump by project need

| Project shape | First page |
| ------------- | ---------- |
| Small app / widget (rare races) | [Guide § Create a bus](guide.md#1-create-a-bus) |
| SPA with async UI | [Policies](policies.md), [Guide § latest](guide.md#3-abort-the-previous-run-with-latest) |
| Unreliable network / long flows | [Effects](effects.md) — one helper per job, then the rest as reference |
| Domain logic off the UI | [Actions, commands, modules](actions.md) |
| Already on Redux / Zustand / MobX / Pinia | [Stores](stores.md) |
| A React form with async checks | [Build a sign-up form in React](react.md) |
| Old responses overwrite new ones | [Cancel stale requests](cancel-stale-requests.md) |
| Debounced input that must also cancel the old request | [Debounce and abort](debounce-and-abort.md) |
| A second click sends a second request | [Prevent a double submit](prevent-double-submit.md) |
| Using mitt, nanoevents or EventEmitter | [Coming from mitt](migrating-from-mitt.md) |
| Moving from redux-saga | [Coming from redux-saga](migrating-from-saga.md) |
| Using RxJS | [Use nanoeffects next to RxJS](migrating-from-rxjs.md) |
| Moving from Effector | [Coming from Effector](migrating-from-effector.md) |

## Reference

- [Policies](policies.md) — `latest`, `leading`, `debounce`, `throttle`, `queue`, `key`
- [Effects and cancellation](effects.md) — `retry`, `timeout`, `poll`, `take`, `all`, …
- [Actions, commands, jobs and modules](actions.md)
- [Sign-up form in React](react.md) — one form: races, double submit, retry
- [Context fields](context.md) — store or client on every task
- [Use the bus from a class](oop.md) — `extendBus`, `@WithBus`, `@On`, and `dispose()` for the subscriptions of an instance
- [TypeScript in many files](typescript.md) — keep the types of the bus in commands and modules
- [Errors and unheard events](errors.md)
- [Package entries](package.md) — which import holds what
- [Plugins](plugins.md) — every plugin of a bus, what it returns, and the order to use them in
- [Tracing](tracing.md) — loggers, Redux DevTools, `notrace`
- [Observable](observable.md) — events as TC39 Observables
- [Hot reload and dev diagnostics](hmr.md)
- [Semantics](semantics.md)
