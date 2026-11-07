# Design

## Context

`all`, `allSettled` and `race` share `groupOrStarter` (`src/effects/run.ts`): one argument is the short form (a function for a group), anything else is the `ctx` form, so the forms are told by `args.length`. A lone argument that is a context (its `signal` is an object) throws a `TypeError`. The `ctx` form takes `options` as its third argument (`GroupOptions`, `concurrency`), read and checked by `concurrencyOf` (a `RangeError` for a bad value).

Why the short form has no options today: `all(effects, options)` and `all(ctx, effects)` both have two arguments that are objects, so the count cannot tell them. `transaction(steps, options)` (change `add-transaction-effect`) has no such problem, because its steps are always an array and a context never is. `all` takes an object as well as an array, so it needs a rule of its own.

Facts about the calls that are valid today, from `docs/effects.md`, the specs and `starter-group.test.ts`:
- The `ctx` form's first argument is a task context (it has a `signal`, an `AbortSignal`), an `AbortController`, an object with a `signal`, or `{}` (the docs: outside a task pass "an object with a `signal`, or `{}`").
- Its second is an object of starters or an array of starters. A starter is a function, including the function that `delay(10)` or `take("x")` returns.
- An effects object may have a key named `signal` whose value is a starter (a function); it is not an abort signal.
- `all({}, effects)` and `all({}, [])` are the `ctx` form and return a promise (a requirement and a test).

## Goals / Non-Goals

**Goals:**
- `all(effects, options)` and `allSettled(effects, options)` work, so a group inside a group can be limited without a wrapper.
- Every call that is valid today means what it meant.
- The rule is short enough to write in one sentence in the docs.

**Non-Goals:**
- Options for `race`: it ends at the first result, so a starter that waited for a free slot would never run.
- New options. `concurrency` is the only one; this change only moves it into the short form.
- A change to the Task forms of `retry`, `timeout` and `poll`, or to the `ctx` form of any effect.

## Decisions

### D1. Decide a two-argument call by the first argument
With two arguments, the first is a context when it is **not an array** and **either its `signal` is an object or it has no function value**. Otherwise it is the effects, and the second argument is the options.

| First argument | Reads as |
| --- | --- |
| an array | effects (a context is never an array) |
| an object whose `signal` is an object (task context, `AbortController`, `{ signal }`) | context |
| an object with no function value (`{}`) | context |
| an object with at least one function value and no object `signal` | effects |

Checked against the facts above:
- `all(ctx, effects)`, `all(controller, effects)`, `all({ signal }, effects)`: `signal` is an object, so context. Same as today.
- `all({}, effects)`, `all({}, [])`: no function value, so context. Same as today.
- `all({ a: first }, { concurrency: 2 })`, `all([first], { concurrency: 2 })`: effects with options. New; today a throw (the first argument has no `signal`, and the effects are then `{ concurrency: 2 }`, whose value is not a function).
- `all({ signal: fn }, options)`: `signal` is a function, not an object, and there is a function value, so effects. Consistent with the existing rule that a key named `signal` is a starter.
- **Unchanged and still ambiguous in theory:** `all({}, {})` has two empty objects. It stays the `ctx` form (it returns a promise, as today). Empty effects with options (`all({}, { concurrency: 2 })`) would also be read as a context with a bad effects object; it is meaningless (nothing to run), and the call fails as it fails today, with the same message, so nothing regresses.
- A context-like object that has function values and no `signal` (not the documented `{}`) would be read as effects. The docs say "an object with a `signal`, or `{}`", so this is outside the documented calls; the docs sentence says it.

Alternatives:
- **Decide by the second argument** (an array or an object with a function value is the effects, so the call is the `ctx` form; anything else is options). It has the same table of edge cases, mirrored, and it reads the argument that is less often a surprise. Rejected: the first argument is what the `ctx` form is named after, and `isContext` already looks at it.
- **Decide only by `signal`** (a context has an object `signal`; `{}` is not one). It breaks the documented `all({}, effects)`. Rejected.
- **A different option position for the short form** (`all.with(options)(effects)`, or `all(effects).with(...)`): a second API. Rejected.
- **Keep the wrapper `(child) => all(child, effects, options)`**: works today, and the owner asked for options in the short form. Rejected.

### D2. `race` keeps counting arguments
`race` has no options, so for it two arguments are always the `ctx` form and nothing changes; `groupOrStarter` stays what `race` uses. `all` and `allSettled` use a second function (or a parameter of the same one, as the code reads best) that reads the first argument for the two-argument case. A lone context still throws the `TypeError` in all three.

### D3. Where the options go in the short form
The starter keeps the options it was given and passes them to the group when a group calls it with its child: `(child) => group(child, effects, options)`. Options are validated when the starter is made, not when a group calls it (`concurrencyOf` runs in `runGroup`, at the call). A bad value therefore throws when the group calls the starter, as in the `ctx` form where the call is the run. This keeps one place (`runGroup`) and the same `RangeError`; the spec scenario says "when a group calls". `transaction` validates when the starter is made; the two differ here on purpose, since `concurrencyOf` already sits in `runGroup`, and moving it would cost bytes for no gain.

### D4. Types
The short-form overloads of `all` and `allSettled` get `options?: GroupOptions | null`. The overloads of the `ctx` form come first, so `all(ctx, effects)` still resolves to them. For `all({ a: first }, { concurrency: 2 })`, TypeScript tries the `ctx` overload first and rejects it, because an object of functions has no property in common with `{ signal?: AbortSignal }` (a weak type), and then takes the short overload; the same holds for an array of starters. **Found in task 1.1:** the short-form overloads must come **first** in `all` and `allSettled`. With the `ctx` overloads first, a two-argument call also fits the short form, and a starter inside it (`retry(...)`) was inferred against the wrong overload and failed. With the short form first, both inside-group calls and `ctx` calls type-check, and a mistake in a `ctx` call is reported against the `ctx` overload (the last one). The edge `all({}, {})` is a `Promise` at run time but typed as a starter (the short form is tried first); it is not a real call, and the types do not pin it. A test in `src/tests/types.test.ts` pins both, and the cases that must stay the `ctx` form (`all({}, effects)`, a task context). If a case resolves to the wrong overload, the fix is an overload order or a tuple constraint found in task 1.1, not a change to the runtime rule.

### D5. The docs sentence
`docs/effects.md` loses "The form without `ctx` takes no options, because a second argument would look like the form with `ctx`; write `(child) => all(child, effects, { concurrency: 5 })` there". It gets: the short form takes `options` as the second argument; a two-argument call is told by its first argument (a context has an object `signal`, or is `{}`); `race` has no options. The concurrency paragraph says "the third argument, or the second in the form without `ctx`". The Russian page says the same.

### D6. Size
A few bytes: one more branch in the helper, and the starter passes `options`. `effects (all)` is at its limit (`3.55 kB` after `add-transaction-effect`, which this change builds on); the task measures it and sets the limit from the number.

## Risks / Trade-offs

- [A valid call today is read in a new way] → the table in D1 is checked against every call shape in the docs and tests; the fuzz test of shapes (task 3) compares the new helper with the old rule on random `ctx`-form calls and fails on any difference.
- [`all({}, { concurrency: 2 })` is not an error with a clear message] → it fails as before; empty effects with options is not a real call. The docs do not suggest it.
- [A reader sees `all(effects, options)` and `race(effects)` side by side and wonders why `race` has none] → the docs say why in one sentence (D5).
- [The rule has an exception for `{}`, and a rule with exceptions is a cost] → one sentence in the docs ("a context has an object `signal`, or is `{}`"); the alternative (a wrapper) is the cost the owner wants gone.
- [`transaction` tells its forms by an array, `all` by this rule] → both are documented where the effect is; each rule matches what its first argument can be.

## Migration Plan

No migration: nothing that is valid today changes. `CHANGELOG.md` `Unreleased` → `### Added`: one bullet and a link to the docs. The version bump is the owner's at release time. This change does not depend on `add-transaction-effect`, but both edit `docs/effects.md` and the `Unreleased` section of `CHANGELOG.md`; apply them one after the other.
