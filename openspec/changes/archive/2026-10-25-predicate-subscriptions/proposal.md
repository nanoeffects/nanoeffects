# Proposal: subscribe by a predicate with `matchPlugin`

## Why

`bus.on` takes one event: a string, an action creator or a command. A handler for a group of events (every `user/*` event, every failure, every command of one domain) has to subscribe to `"*"` and test `ctx.type` by hand. The check has no type narrowing, and it is easy to forget it. `take` already has a `predicate`, with type guards, to pick the event to wait for; `on` has no such thing.

## What Changes

- New entry `nanoeffects/match` with `matchPlugin()`. After `bus.use(matchPlugin())`, `on`, `once` and `off` of the bus (and `ctx.on` / `ctx.off`, which use them) take a predicate as the first argument:
  - `bus.on((action) => action.type.startsWith("user/"), (payload, ctx) => { … })`;
  - a type guard `(action): action is { type: "user/loaded"; payload: User }` narrows the payload of the handler.
- It is an overload of the existing methods, not a new method. A function with a string `type` (an action creator, a command) keeps its meaning; a function without one is a predicate.
- A plugin, not core: `createBus` does not change.
- The predicate gets `{ type, payload }` of an event of the bus. This is the idea of `take`'s `predicate`, but over every event, so it gets the action and not one payload.
- `devPlugin` is fixed so that the order of the two plugins does not matter: it names a predicate subscription `"*"`, and its `disconnect` no longer replaces `bus.on` blindly.
- Costs, written in the docs: each event creates one task per predicate subscription even when the predicate says no, and such a subscription counts as a listener for `onUnhandled`.

## Non-goals

- Patterns by string or regular expression, wildcards in event names.
- A change to `take`, or to `on` without the plugin.
- A way to find out which predicate matched.

## Capabilities

### New Capabilities

- `predicate-subscriptions`: subscribing to the events of a bus by a predicate, with type guards, once and off, and how that interacts with tasks, policies, errors and `onUnhandled`.

### Modified Capabilities

- `dev-diagnostics`: `devPlugin` counts a predicate subscription under `"*"` (it would otherwise count it under `undefined`), and its `disconnect` leaves a wrapper that another plugin put on `bus.on` after it, so the two plugins can be used in any order.

## Impact

- Changed: `src/dev/plugin.ts` (the key of a predicate subscription, a `disconnect` that is safe in any order) and its tests.
- New: `src/match/` (`index.ts`, `plugin.ts`, tests), the entry in `package.json` (`exports`, `size-limit`), `tsdown.config.ts` (main build only, like `scope`), the aliases `nanoeffects/match` in `tsconfig.json` and `vitest.config.ts`.
- Docs: `docs/plugins.md`, `docs/package.md`, a section in `docs/guide.md` next to "Listen to every event", `CHANGELOG.md` (`Unreleased`), one line in `AGENTS.md`.
- `createBus` must be the same size before and after (measured). Emit on a bus without the plugin is unchanged.
