# Design: `$effects`

See `proposal.md`. The requirements are in `specs/scope-context/spec.md`.

## Context

A scope is a flat object. `put` in `src/scope/plugin.ts` walks the keys of each layer, reads the values each time, and treats the key `effects` as the bound functions. The same name is in the types (`Scope.effects`, `BoundEffects`, `FieldsOfScope` omits it, `EmitScope.effects`) and in `beneath` in `src/actions/carry.ts`, which merges the `effects` of two scopes.

## Decisions

### Rename the key only

`$effects` is a property name, so it needs no change to the types beyond the property name: `Scope = { readonly $effects?: Effects; readonly [field: string]: unknown }`. The types and functions around it (`Effects`, `Effect`, `effect`, `effectsPlugin`) are about effects as a concept and keep their names.

### One spelling

No alias for the old key. With it, a scope with `effects` would sometimes bind and sometimes not, depending on a flag, and the point of the change is that `effects` is a plain field.

### No migration helper or warning

A field named `effects` is valid now, so a warning would be wrong for those who use it. The silent failure of an old scope is the price of a published 0.x API; the notes say what to rename. A type error would help, but a scope's index signature accepts any key, and a type that rejects `effects` would take the name away again.

### Names in the code

The local variable `effects` in `put` and the helper names stay readable: `layer.$effects` is read into a local called `effects`. `reserved` (the library's own context fields) does not change.

## Risks / Trade-offs

- [An old scope silently stops binding] → The notes name the rename; the docs show only `$effects`; the first migration failure is a missing function on `ctx`, which is easy to find.
- [`$` in a property name reads as magic in plain JavaScript] → It is the point: the one reserved name is marked. The docs say once that it is an ordinary key with a reserved name.

## Migration Plan

Rename `effects` to `$effects` in every scope. Released as the next breaking version (0.7.0 is recommended; the owner decides). Rollback is the reverse rename.
