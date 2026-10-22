# Proposal: the Effector form example in `docs/migrating-from-effector.md`

## Why

The page "Coming from Effector" maps names and rewrites one effect (search). An Effector user has a second, more common picture in mind: the form from the official Effector recipe, [Forms](https://effector.dev/en/recipes/react/forms/). It has an event for each field, a store for the values, a `sample` that reads the store on submit, and a React component. Showing that exact form next to its nanoeffects version answers "where does my `$form` and my `sample` go?" better than the table does. The answer is partly "nowhere": nanoeffects holds no state, and the page should say so with code.

## What Changes

- A new section "Rewrite a form" in `docs/migrating-from-effector.md`, after "Rewrite an effect". It shows the Effector form (events `formSubmitted` and `fieldUpdate`, effect `sendFormFx`, store `$form`, `sample`, `fieldUpdate.prepend`, `useStoreMap`, a watcher that calls `preventDefault`), adapted from the Effector docs with a link, and then the same form with nanoeffects:
  - the values live in React `useState` (or in any store of [Stores](stores.md)); nanoeffects does not hold them;
  - the effect becomes a handler `bus.on("form/submitted", handler)`;
  - `sample({ source: $form })` becomes the values in the payload of the event, `bus.emit("form/submitted", form)`; one sentence says that a store outside React can be given to handlers with `createBus({ context: { store } })`;
  - `preventDefault` is called in the `onSubmit` handler, not in a separate watcher.
- A short follow-on that keeps the page to one job per example: what to add when the log becomes a request (`leading` for the double click, `ctx.signal`, `retry`), with a link to [Build a sign-up form in React](react.md) instead of repeating it.
- Three rows in the equivalence table: `fieldUpdate.prepend(fn)`, `useStoreMap`, and `watch` with `preventDefault`.
- `CHANGELOG.md`: one line.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. Documentation only, so the change sets `skip_specs: true`.

## Non-goals

- Anything in `src/`, or a bridge between Effector stores and nanoeffects (the page already has "Use both in one app").
- A second form example, validation, or a form library: the Effector recipe is the base case and it has none.
- Changes to `docs/react.md`, `docs/stores.md` or the README.
- Installing Effector: the Effector blocks carry a skip marker with a reason.

## Impact

- `docs/migrating-from-effector.md` (the file has other uncommitted edits of the owner; the new text is added, the existing text is kept), `CHANGELOG.md`.
- `pnpm docs:check` checks the nanoeffects blocks (`jsx` fences, a block names its file); `pnpm llms:check` is unaffected (no new page).
