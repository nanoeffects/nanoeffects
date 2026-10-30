## Context

The audit read the 16 entries of `package.json` `exports` and their sources. Findings that shape the decisions:
- `src/tests/exports.test.ts` already pins the runtime export names of some entries (`main`, `context`, `effects`, `policies`, `trace`, `observable`, `redux`, `actions`); the others (`scope`, `match`, `signal`, `oop`, `react`, `svelte`, `vue`, `dev`) and all type exports are not pinned.
- `Effect` and `Effects` are exported by `effects` and by `scope`, but both re-export the same types from `src/core/effect-types.ts`, so they are one type with two import paths, not two meanings.
- `bindHandler` is documented in `docs/actions.md`; `onAbort` in `docs/effects.md`, `docs/stores.md` and `docs/observable.md`.
- CI tests the library on Node 18, 20, 22 and 24, and the checks that need the dev tools on 22 and 24. TypeScript 7 (`tsgo`) type-checks the project and `typescript-5` (^5.9.3) is a devDependency. Peers: `react >=18`, `svelte >=5`, `vue >=3.3`.

See proposal.md for the motivation.

## Goals / Non-Goals

**Goals:**
- Write down what 1.0 promises, and make a change to the surface show up in a test.
- Settle each inconsistency with the least breaking choice.

**Non-Goals:**
- New features, removing an entry, moving code to another package, changing any behavior.

## Decisions

### 1. Stable and unstable entries

Stable: `.`, `effects`, `policies`, `actions`, and the trace contract (`Tracer`, `TraceEvent`, `Trace`, `TraceLogger`, `Phase`, `EffectName`, `tracePlugin`). These are the owner's list. Unstable: `scope`, `match`, `signal`, `context`, `oop`, `observable`, `dev`, `redux`, `react`, `svelte`, `vue`, and inside `trace` the loggers and `reduxDevtools` with its option and stage types. Confirmed by the owner: the framework adapters (`react`, `vue`, `svelte`), `redux`, and the small plugins `context`, `signal` and `match` are unstable. The adapters and `redux` are unstable because they follow the peers' APIs and have had little use; they move to stable after the soak period if nobody needs a change. The page says what unstable allows: a change in a minor release with a CHANGELOG note, no deprecation period promised.

*Rejected:* marking everything stable (too much to promise); marking in code (`@experimental` tags) as the only source (the page is what a user reads, and the tags can follow later).

### 2. The semver rules

Breaking for a stable entry: a change to the runtime behavior of a call, to a type a caller sees in a way that stops code that compiled before from compiling, or to the set of exports. A stricter inference that only finds mistakes in code that was already wrong is not breaking and ships in a minor with a CHANGELOG note. Not covered: unstable entries, dev diagnostics text, trace payload details. A deprecated export stays until the next major version; before 1.0, a breaking change ships in a minor with `### Breaking` as today.

### 3. The inconsistencies, one decision each

**a. `On` (type in `.`, decorator in `oop`).** Keep and document. They live in different entries and a program rarely imports both; the decorator name reads well and the type is used by plugin authors. A note in `docs/oop.md`. *Rejected:* renaming the decorator (breaking, worse to read) or the type (breaking for plugin authors).

**b. `Effect` and `Effects` in `effects` and `scope`.** Keep. They are the same type; the page for each entry says so. *Rejected:* removing one path, which breaks imports for no gain.

**c. `RaceStarter`, `Starter`, `StarterOf`.** `StarterOf<E, R>` is the public name. `RaceStarter<T, Child>` stays in 0.26.0 with `@deprecated` pointing to `StarterOf`, and may go in 1.0.0 as a documented breaking change. `Starter` stays internal. The local type `StarterOf` in `plugin.ts` is not exported and is renamed `BoundStarter` so the two names no longer collide. *Rejected:* exporting `Starter` as a third name; removing `RaceStarter` now (breaking in a minor without need).

**d. `onAbort` in `effects`.** Keep. It is used in three pages and moving it breaks them. *Rejected:* moving it to the main entry, which would grow `createBus`'s entry.

**e. `bindHandler`.** Keep. It has a documented user (`docs/actions.md`); the audit's earlier doubt was wrong.

**f. Three call forms of `retry`, `timeout` and `poll`.** Keep all three and say in `docs/effects.md` and `docs/stability.md` that they are permanent. The forms are told apart by the number and type of arguments, never by `fn.length`, and that rule is part of the contract. *Rejected:* removing the wrapper form (it is the starter form's base and in many examples).

**g. Options only in the `ctx` form of `all`, none in `race`.** Keep. The short form takes one argument by design, and `race` ends at the first result so a limit has no meaning. Documented next to the `concurrency` example. *Rejected:* a short form with options (cannot be told from the `ctx` form) and `concurrency` for `race`.

### 4. Pinning the surface

The runtime test lists `Object.keys` of every entry, as `exports.test.ts` does now, and adds the missing entries. A second test lists the type exports: it creates a program with the `typescript-5` compiler API over `src/*/index.ts` (the entry files from `tsdown.config.ts`) and reads `getExportsOfModule`, keeping the names that are types. The two lists live in one test file so a change to the surface is a diff in one place. A third check reads `package.json` `exports` and fails if an entry is missing from `docs/stability.md`.

*Rejected:* snapshotting the `.d.ts` of `dist` (needs a build and the files hold chunk hashes); an API Extractor report (a new tool for one list).

### 5. The stability page

`docs/stability.md` is a reference page, written for the reader who asks "can I rely on this". Order: the table of entries, then the semver rules, then the support policy, then the permanent call forms. Support numbers come from `package.json` and `ci.yml` and the page says so. It is added to `llms.txt` and the docs index (`docs/README.md`), and `pnpm llms:check` passes.

## Risks / Trade-offs

- [The type-export test depends on the TypeScript 5 compiler API] → it is already a devDependency; if the API shifts, the test is the only thing to fix.
- [Numbers on the page go stale] → a test compares the Node list and the peer ranges with `package.json` and the CI file.

## Migration Plan

None for users. 0.26.0 is additive (a deprecation note and docs). Rollback is reverting the docs and tests.

## Open Questions

None. The owner confirmed the stable and unstable lists in decision 1.
