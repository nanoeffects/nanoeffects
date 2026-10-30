# Design

## Context

`examples/chat` is the model for the layout: domains as folders with events, handlers, a Zustand store and a module, `bus.ts` with no events, `app.ts` with `modulePlugin([...])` (modules start at the end of the block since 0.20.0), a thin UI, `WithSignal` for the signal parameters, and a `tsconfig.json` with `paths` to `src` so the repository type-checks it. See proposal.md for why.

## Goals / Non-Goals

**Goals:**
- A real API, so the errors are real: a 404 for an unknown name, a slow answer, a lost connection.
- Few files: two domains and a small UI, so the example reads in one sitting.

**Non-Goals:**
- A second copy of the chat's lessons (a stream, a queue, `take`, `poll`).
- Tests that call the network: the example is checked by types and lint, and run by hand.

## Decisions

- **Two domains.** `pokemon` owns the search, the random button and the card; `abilities` owns the descriptions. `abilities` reacts to `findPokemon.success` of `pokemon`, by its events file, as in the chat.
- **The search is one job under four wrappers.** `findPokemon` is a job (`pending`, `success`, `fail`, `cancel` give the page its states). Its handler is `debounce(400, latest(timeout(8000, retry(load, { times: 3, delay: 300, shouldRetry }))))`, read from the inside out: the request, tried again, limited as a whole, one at a time, after quiet. `shouldRetry` is false for an `HttpError` with a status below 500, because a 404 is an answer.
- **404 versus failure on the page.** The `fail` outcome gets the error; the module turns an `HttpError` with status 404 into "No such pokémon" and anything else into "PokeAPI did not answer".
- **Random under `leading`.** `randomRequested` is an action handled by `leading(...)`: it picks a number from 1 to 1025 and awaits the search job. A second click while that runs is dropped.
- **Abilities with `allSettled` and `timeout`.** `loadAbilities` is a job under `latest`. Its handler asks every ability of the pokémon with `allSettled`, each request under `timeout(3000)`; a result is the text or a failure marker, and the page names the failed ones, as the chat's search does.
- **State.** One Zustand store per domain with the mutations listed in it, as in the chat. No immer: the values are plain.
- **Client.** `src/api.ts` has `getPokemon(name, WithSignal)` and `getAbility(name, WithSignal)` and an `HttpError` with `status`; the types of the answers list only the fields the page uses.
- **Dependency.** `nanoeffects ^0.20.0`; the repository maps it to `src` through `paths`, as the chat does.

## Risks / Trade-offs

- [PokeAPI is down or slow when someone runs the example] → that is the point of `timeout` and `retry`, and the README says so; the page shows the failure state.
- [The shape of an answer changes] → the types list few fields, and the client is one file.
- [Fair use of a public API] → requests are debounced, aborted when replaced and few (a card and at most three abilities); the README asks to keep it that way.

## Open Questions

None that change the specs.
