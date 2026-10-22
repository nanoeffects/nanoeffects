# Design

## Context

`docs/migrating-from-effector.md` has the sections "Split the work", "Find the equivalent" (a table), "Rewrite an effect", "Use both in one app" and "What is different". The Effector snippets there carry `<!-- docs-check: skip - needs effector, which the project does not depend on -->`. `docs/react.md` (change `framework-recipes`) shows a React form with `useEffect` subscriptions, and `docs:check` accepts `jsx` fences and a block that names its file with a first-line comment. The Effector recipe is the official one at effector.dev; its code is read in the proposal and reproduced there with the link.

## Goals / Non-Goals

**Goals:**
- A reader who knows the Effector form can find each of its parts on the nanoeffects side, including the parts that have no counterpart.

**Non-Goals:**
- Teaching React forms: the component is the shortest one that does what the Effector one does.

## Decisions

**1. A faithful port first, then one step up.**
The Effector recipe does very little: it logs the values on submit. The first nanoeffects snippet does the same (a handler that logs), so the two forms can be compared line by line. A second, short snippet shows what changes when the log becomes a request: `leading` and `ctx.signal`, with `retry` named and a link to [Build a sign-up form in React](react.md). Alternative: show the sign-up form from `docs/react.md` here. Rejected: it hides the comparison and repeats a page.

**2. State is `useState`, said plainly.**
`$form`, `fieldUpdate`, `.prepend` and `useStoreMap` all serve one job: keep the values and re-render a field when its value changes. In React that is `useState` with `setForm((form) => ({ ...form, [name]: value }))`. The page says that nanoeffects has no store and that any store of [Stores](stores.md) works the same way. No `useStoreMap` equivalent is invented.

**3. The submit values go in the payload.**
`sample({ clock, source: $form, target })` reads a store at the moment of the clock so that the event does not carry stale values. In a component the values are at hand, so `bus.emit("form/submitted", form)` is the same thing. For a store that lives outside React, one sentence points to `createBus({ context: { store } })` and [Context fields](context.md); no code is repeated.

**4. `preventDefault` moves into the handler.**
Effector uses a separate `formSubmitted.watch` for it because the event is passed straight to `onSubmit`. Here the component's `onSubmit` is a function that calls `event.preventDefault()` and then emits. The table row says so.

**5. Snippets: two files named by a comment.**
The bus (`// form-bus.js`) and the component (`// SignUpForm.jsx`), so that the component imports the bus and `docs:check` resolves it. The Effector block gets the skip marker with the reason used elsewhere on the page. Each nanoeffects call has a comment; names are local to their snippet.

## Risks / Trade-offs

- [The Effector code drifts from the official recipe] → the block names the source and the version of the docs page it follows; Effector API names in it (`createEvent`, `createStore`, `createEffect`, `sample`, `useStoreMap`, `.prepend`) are stable.
- [The page grows too long] → the section is one short intro, two code blocks per side and a few sentences; the three table rows replace prose.
- [Another session edits the same file at the same time] → the section is inserted between two existing headings, the rest of the file is not touched.
