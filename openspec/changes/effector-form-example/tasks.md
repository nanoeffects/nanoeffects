# Tasks

## 1. The section

- [x] 1.1 In `docs/migrating-from-effector.md`, after "Rewrite an effect", add "Rewrite a form": the intro (what the Effector form does and which parts have a counterpart), the Effector code with the skip marker and the source link.
- [x] 1.2 Add the nanoeffects form: `// form-bus.js` with the handler that logs, and `// SignUpForm.jsx` with `useState`, the `onSubmit` that calls `preventDefault` and emits the values. A comment on each nanoeffects call.
- [x] 1.3 Add the short follow-on: what changes when the log becomes a request (`leading`, `ctx.signal`, a pointer to `retry`), with a link to `react.md`, and the one sentence on a store outside React (`context`).
- [x] 1.4 Add the three table rows (`fieldUpdate.prepend`, `useStoreMap`, `watch` with `preventDefault`) to "Find the equivalent"; add a bullet to "What is different" only if it says something new.

## 2. Check

- [x] 2.1 `pnpm docs:check` passes with the new nanoeffects blocks checked (not skipped) and `pnpm llms:check` passes.
- [x] 2.2 `CHANGELOG.md`: one line under Unreleased.
- [x] 2.3 Read the page from the top as an Effector user: the new section follows from the table, links resolve, no term is used before it is explained.
- [x] 2.4 `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm vitest run && pnpm build`, then `pnpm verify`; it must pass.
