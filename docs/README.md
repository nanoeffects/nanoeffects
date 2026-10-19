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
| Already on Redux / Zustand / MobX | [Stores](stores.md) |

## Reference

- [Policies](policies.md) — `latest`, `leading`, `debounce`, `throttle`, `queue`, `key`
- [Effects and cancellation](effects.md) — `retry`, `timeout`, `poll`, `take`, `all`, …
- [Actions, commands, jobs and modules](actions.md)
- [Context fields](context.md) — store or client on every task
- [Errors and unheard events](errors.md)
- [Package entries](package.md) — which import holds what
- [Tracing](tracing.md) — loggers, Redux DevTools, `notrace`
- [Observable](observable.md) — events as TC39 Observables
- [Hot reload and dev diagnostics](hmr.md)
- [Semantics](semantics.md)
