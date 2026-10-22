# Proposal: explain why the search example passes `ctx.signal`

## Why

`examples/search.ts` is the first thing a level B reader copies (and the playground runs it). It passes `{ signal: ctx.signal }` to `api.search` with no word on why. A reader sees `latest` and may assume it cancels the request by itself. It does not: `latest` aborts the signal and drops the old result, but a request that was never given the signal keeps running on the server and the network. The comment is the cheapest place to say so.

## What Changes

- `examples/search.ts`: a short comment above the `api.search` line says that `latest` aborts `ctx.signal` when a newer query arrives, and that passing it on is what cancels the in-flight request; without it the old request runs to the end and only its result is dropped.
- `examples/playground/main.ts`: the same comment in the same place. `src/tests/playground.test.ts` compares the `bus.on("typed", ...)` block of both files, so they must stay identical.
- `README.md` (the `latest` snippet) and `docs/policies.md` (the first snippet): the same idea as one inline comment on the `api.search` line. Both pages already say it in prose under the snippet; the comment is for readers who skim code first. No new block, no new text paragraph.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. Documentation and example comments only, so the change sets `skip_specs: true`.

## Non-goals

- Any change of behavior, of `src/`, of types or of the other snippets that pass `signal` (`docs/guide.md`, `examples/guide.ts`, `examples/redux.ts`).
- A new section about `AbortSignal`: the prose under the snippets stays as it is.
- A comment in every snippet with `signal`: only the entry examples (the search flow) get it.

## Impact

- `examples/search.ts`, `examples/playground/main.ts`, `README.md`, `docs/policies.md`. No `CHANGELOG.md` entry: nothing changes for users of the package.
- `pnpm docs:check` and `pnpm tsgo` cover the edited snippets; the playground test covers the identical wiring.
