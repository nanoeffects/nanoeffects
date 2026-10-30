# Proposal

## Why

`docs/query-libraries.md` shows one read command that React Query calls. A reader who already uses React Query wants to see a whole small app: a search, a filter, pages, a detail panel. That is where the split between the two is the least obvious: React Query keeps the cache and the state of the screen, but it does not know about a retry that skips a "not found" answer or about a limit of time. The Rick and Morty API is a public, read-only API with CORS, search, filters and pages, so the example needs no server and nothing to write.

## What Changes

- A new example project, `examples/rickandmorty/`: React and TypeScript, `@tanstack/react-query` for the cache and the screen, and nanoeffects commands for the requests, against `https://rickandmortyapi.com`.
- Two commands that carry their handlers, both called with `bus.emit(command, { signal })` from a `queryFn` (`signalPlugin`): `findCharacters` (a page of characters by name and status; `timeout` and `retry` that does not repeat a 404, which the API sends for "nothing found" and the command turns into an empty page) and `loadEpisodes` (the episodes of one character in one request, `timeout` and `retry`).
- The screen: a search form (name and status), a list with a "Load more" button (`useInfiniteQuery`), and a detail panel with the episodes of the chosen character (`useQuery`).
- `examples/rickandmorty/README.md`, a row in `examples/README.md`, a line in `CHANGELOG.md`, and a link from `docs/query-libraries.md`.
- `@tanstack/react-query` becomes a dev dependency of the repository, so the example and the docs are type-checked with its real types; its stub is removed from the docs check.

Out of scope: SWR, a server, writes (the API is read-only), tests that call the network, and any change in `src/`.

## Capabilities

### New Capabilities
- `rickandmorty-example`: the Rick and Morty browser with React Query.

### Modified Capabilities

## Impact

- New folder `examples/rickandmorty/` (not published), type-checked by `pnpm tsgo` and linted by `pnpm check`. It depends on the published `nanoeffects ^0.20.0` and on the network only when it is run.
- `package.json` and `pnpm-lock.yaml` (the dev dependency), `scripts/docs-stubs.d.ts`, `docs/query-libraries.md`, `examples/README.md`, `CHANGELOG.md`. No change to `src/`, the package or the size limits.
