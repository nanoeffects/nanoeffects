# Tasks

## 1. Stores page

- [x] 1.1 In `docs/stores.md` remove the `useState` paragraph, the `search-state.jsx` block and the closing sentence about both sources; reword the intro to Redux only.
- [x] 1.2 Rename the heading to "React: useDispatch as a source" and update the entry and anchor in "On this page".
- [x] 1.3 Check that no other page links to the old anchor (`grep -rn "usestate-and-usedispatch" docs README.md llms.txt`).

## 2. Changelog and spec

- [x] 2.1 Edit the `Unreleased` line of `CHANGELOG.md` to describe a `useDispatch` component only.
- [x] 2.2 When archiving, fix the Purpose line of `openspec/specs/docs-react-sources/spec.md` (Redux `useDispatch` only).

## 3. Verify

- [x] 3.1 `pnpm docs:check` and `pnpm llms:check` pass; `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm vitest run && pnpm build` pass.
