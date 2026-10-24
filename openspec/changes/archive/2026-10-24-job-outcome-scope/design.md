# Design: the outcome action's own scope wins over the job's

See `proposal.md`. The requirement is in `specs/scope-context/spec.md`.

## Context

`send()` emits the outcome with `ctx.emit(action, jobScope)`. `scopePlugin` builds the layers of that emit as `[the action's own scope, the explicit scope]`, and a later layer wins, so the explicit job scope replaces the action's fields.

## Decisions

### Merge in `send`, not in the plugin

`send` reads the scope the creator carries (the same symbol `carry` writes) and, when there is one, passes a merged scope: the job's fields with the action's over them, and `effects` merged the same way one level deep. The plugin keeps its simple rule that an explicit scope is the strongest. The alternative, a "weaker explicit" layer in the plugin, adds a concept for one caller.

When the creator has no scope, `send` passes the job's scope as before, so nothing changes for that case and no object is made.

### Cost

One extra object per outcome, only when both the job and its outcome action have a scope. Everything else is the same.

## Risks / Trade-offs

- [The merged object is made each time] → It only happens when both scopes exist; if it shows up in the benchmark, cache it per creator.
- [`effects` merged one level deep] → Matches how a reader thinks of two scopes; a name set by both takes the action's.

## Migration Plan

None: the case changes only for a job whose outcome action has its own scope, released a few days ago. CHANGELOG `Unreleased`.
