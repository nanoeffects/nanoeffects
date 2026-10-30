# Design

## Context

The chat and the pokédex use the layout of domains. This example is the opposite on purpose: one file for the bus, one for the command, one component. A command that carries its handler works with a plain bus, with no plugin and no module, because `bus.emit(command)` runs the handler it carries.

## Goals / Non-Goals

**Goals:**
- Show the least code that does a search that does not race.
- Show what a command returns, and what it returns when a call is dropped.

**Non-Goals:**
- Outcomes, stores, modules: those are the chat and the pokédex.

## Decisions

- **A command with a handler, not a job.** The result is the return value of `bus.emit`, so the component needs no listener and no store. A job is the better tool when several components read the state of the call or when the handler is bound elsewhere; the README says so.
- **The handler, read from the inside out.** `retry(load)` tries a failed request again (3 attempts); `timeout(5000, ...)` limits all the attempts together; `latest(...)` keeps the newest call; `debounce(300, ...)` waits for quiet. PotterAPI answers an unknown word with an empty list and status 200, so no status needs to be told apart and `retry` has no `shouldRetry`.
- **`undefined` is a normal result.** A call that `debounce` drops, or that `latest` replaces, resolves with `undefined`, and the component ignores it. That is the type `Spell[] | undefined` of the result, kept as it is and not hidden.
- **The loading flag is a counter.** A boolean set before and cleared after the call would be cleared by a dropped call that settles first. The counter goes up at each call and down in `finally`, so the page is loading while any call is in flight. This is the problem that a job's outcomes solve with `pending` and one of three endings; the counter is the small version.
- **Empty query.** PotterAPI returns all 72 spells for an empty search, so the page loads the whole list at start with the same command, which shows the happy path before the reader types.
- **Files.** `bus.ts` (the bus), `spells.ts` (the type, the client with `WithSignal`, the command), `App.tsx` (the component), `main.tsx`, `index.html`, `package.json`, `tsconfig.json` (with `paths` to `src`, as the other examples), `README.md`.

## Risks / Trade-offs

- [PotterAPI changes or goes down] → the types list three fields, the client is one function, and the page shows an error line.
- [Fair use of a public API] → the search is debounced and aborted when replaced.
- [Overlap with the pokédex] → the pokédex has domains, a job and `allSettled`; this one is the no-domain version and has none of them.

## Open Questions

None that change the specs.
