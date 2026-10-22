# Tasks

## 1. Check the claim

- [x] 1.1 Read `src/policies/latest.ts` and `docs/semantics.md`: confirm that `latest` aborts the signal and drops the old result, and does not cancel a request by itself. Fix the wording of the comment if the code says otherwise.

## 2. Example and playground

- [x] 2.1 Add the two-line comment above the `api.search` line in `examples/search.ts`, in the style of the file (tabs, comment density).
- [x] 2.2 Copy the same comment, byte for byte, into `examples/playground/main.ts`; run `pnpm vitest run src/tests/playground.test.ts`.

## 3. README and policies

- [x] 3.1 Add the one-line comment on the `api.search` line of the `latest` snippet in `README.md` (a level A-B check: no new block or paragraph) and in the first snippet of `docs/policies.md`.

## 4. Final check

- [x] 4.1 `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm vitest run && pnpm build`, then `pnpm verify`; it must pass.
