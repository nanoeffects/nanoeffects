# docs-query-libraries Specification

## Purpose
TBD - created by archiving change emit-with-signal. Update Purpose after archive.

## Requirements

### Requirement: A page for React Query and SWR
The docs SHALL have a page that shows how to call a command through `bus.emit(command, { signal })` from the `queryFn` of React Query and the `fetcher` of SWR, say which side owns `isLoading`, `data`, the cache and revalidation, and which side owns `retry`, `timeout`, policies and abort. It SHALL be linked from `docs/react.md`, `docs/plugins.md` and `llms.txt`.

#### Scenario: React Query recipe
- **WHEN** a reader opens the page
- **THEN** they find a JS example with `useQuery({ queryKey, queryFn: ({ signal }) => bus.emit(getUser(id), { signal }) })`, with the bus, the command and the component in separate files, and a comment on each nanoeffects call

#### Scenario: SWR recipe
- **WHEN** a reader opens the page
- **THEN** they find a JS example of `useSWR` whose fetcher calls `bus.emit(command(key))` without a signal, with the note that the SWR docs (checked when the page was written) say the fetcher gets only the key, so the command still brings `retry` and `timeout` but the library does not abort it

#### Scenario: Why not `isLoading` from emit
- **WHEN** a reader looks for `const { isLoading, data } = await bus.emit(...)`
- **THEN** the page says that `await` resolves once, so the loading state comes from the library, and that `createJob` outcomes are for cases without one

### Requirement: The examples are type-checked
Every code block of the page SHALL pass `pnpm docs:check`, with the libraries it imports declared in `scripts/docs-stubs.d.ts`.

#### Scenario: Docs check
- **WHEN** `pnpm docs:check` runs
- **THEN** the page passes
