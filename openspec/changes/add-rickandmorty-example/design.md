# Design

## Context

`docs/query-libraries.md` already fixes the split: the library keeps `isLoading`, `data`, `error` and the cache; nanoeffects keeps `retry`, `timeout` and the abort. `signalPlugin` lets `emit` take the signal of the library. A command that carries its handler works on a plain bus.

## Goals / Non-Goals

**Goals:**
- A whole small app with a search, a filter, pages and a detail, in few files.
- Show what nanoeffects adds that the library does not have: a retry that knows which errors to repeat, and a limit of time.

**Non-Goals:**
- Replacing React Query's own features (cache time, refetch, `placeholderData`).
- Domains, modules or stores: the cache is the store.
- Debouncing the input. A policy that drops an older call resolves it without a value, which React Query would take as a result; the form is sent on submit, and the abort of an older query is the library's own.

## Decisions

- **Commands, not jobs.** The result of a request is the return value of `bus.emit`; React Query turns it into `data`, `isPending` and `error`. Job outcomes would duplicate that state.
- **`findCharacters({ name, status, page })`.** Handler: `timeout(retry(...))` in the form the docs use, with `shouldRetry` that rejects a `NotFound` error. A 404 is turned into `{ results: [], pages: 0 }` inside the command, so the screen has no special case for it.
- **`loadEpisodes(ids)`.** One request to `/episode/1,2,3`. The API returns an object, not an array, for a single id, so the client normalizes it.
- **Pages.** `useInfiniteQuery` with `initialPageParam: 1` and `getNextPageParam` from `pages`; the query key holds the name and the status.
- **Files.** `bus.ts`, `api.ts` (the client, `WithSignal`, `HttpError`, the types of the API), `characters.ts` (the two commands), `App.tsx`, `main.tsx` (the `QueryClientProvider`), `index.html`, `package.json`, `tsconfig.json`, `README.md`.
- **Dependency of the repository.** `@tanstack/react-query` is added to the dev dependencies so that `pnpm tsgo` checks the example with the real types; its stub in `scripts/docs-stubs.d.ts` goes and `pnpm docs:check` checks the docs against the same types. SWR keeps its stub.

## Risks / Trade-offs

- [The API is down or slow] → `timeout` and `retry`, and the page shows React Query's error state.
- [The docs check changes with the real types] → run it and fix the page if a block breaks.

## Open Questions

None that change the specs.
