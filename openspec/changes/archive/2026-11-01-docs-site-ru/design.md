## Context

`docs/` has 34 pages (7,171 lines) written under the Documentation section of AGENTS.md. `tools/docs-site` builds them with VitePress (`srcDir` is `docs/`). `scripts/docs-check.mjs` and `scripts/llms-full.mjs` read `docs/*.md` flat, one level only. Snippets carry English comments.

Gaps seen in a first read of the entry points (the review must confirm and extend these, not stop at them):
- README: the first snippet calls `analytics.track` and the second `api.search` with no word that they are the app's own.
- `docs/README.md` is three things at once: a ladder ("Start here"), a jump table by project shape, and a flat reference list; the levels A to F of AGENTS.md are not visible to a reader.
- Recipes are spread over about a dozen pages (`cancel-stale-requests`, `prevent-double-submit`, `server`, `react`, ...) with no single index by problem.
- `guide.md` has 11 numbered steps; nothing says which step ends level A, where a small app can stop, and what the prerequisites are for step 8 and later.
- Install is one command in the README; Node and TypeScript versions, bundlers and ESM-only consequences (no `require`) live on `stability.md` and `package.md`.

## Goals / Non-Goals

**Goals:** a newcomer can go from "what is this" to a working first example to the recipe for their case, and then up the ladder A to F, without guessing the next page; a Russian version at the same clarity; the code of a translation cannot drift from the English one unnoticed.

**Non-Goals:** new library features, a search or build-time translation tool, keeping the prose of both languages in sync by a check.

## Decisions

### The review is critical, written down, and done as the newcomer

Each page is read as someone who has not read the others, with the checklist below. Findings go to `review.md` in the change folder (page, question, finding, fixed or left). Nothing is fixed without a line in the report, so the owner can see what moved.

Newcomer checklist, in the order a newcomer asks:
1. **What is it, and do I need it?** Purpose in the first lines; a "when not to use it" sentence where it matters.
2. **How do I install it?** Command for npm, pnpm and yarn; Node and TypeScript versions; ESM only and what that means for `require` and bundlers.
3. **How do I start?** A first example that runs after the install, with every name defined or marked as the app's own.
4. **Where is my recipe?** Reachable from the README and from `docs/recipes.md` by the problem, not by an API name.
5. **What next?** Each page ends with the next step for its level, and says what to read first if it assumes something.
6. **Where am I?** Each page names its level (A to F) near the top.
7. Plus the standing rules of AGENTS.md: one paragraph one idea, JS first, types explained next to the code, names local to a snippet, one step per line, a comment on each library call, one term one meaning, headings name the job.

A page that cannot be made clear without a new or changed API is recorded as left; the owner decides whether it becomes its own change.

### The ladder is `docs/README.md`

`docs/README.md` is rewritten as the map: one block per level A to F (kind of project, "you can stop here if", first page, what it assumes), then the jump-by-need table, then the reference list. The README of the repo stays levels A and B only and links here. The levels follow the table of AGENTS.md; the guide steps are mapped to levels (steps 1 to 2 are A, 3 to 4 are B, 5 to 6 are C, 7 to 9 are D, and so on, as the review confirms).

### Sidebar by sections, with short nested links

The sidebar is regrouped by the reader's job. Proposed groups (the review confirms them):
1. **Start**: Guide, Start from a template, Why nanoeffects, Package entries.
2. **Async UI recipes**: Cancel stale requests, Debounce and abort, Prevent a double submit, Errors.
3. **Policies**: Policies, with `latest`, `leading`, `debounce`, `throttle`, `queue`, `key` as nested short links.
4. **Effects**: Effects and cancellation, with `retry`, `timeout`, `poll`, `backoff`, `take`, `all`, `race`, ... as nested short links.
5. **Domain logic**: Actions, jobs and modules; Context fields; Scopes; Use the bus from a class; TypeScript in many files.
6. **Frameworks**: React, Vue, Svelte (and the chat examples that use them).
7. **Libraries and stores**: Redux, Zustand, MobX, Pinia (`stores`), React Query, SWR, RTK Query (`query-libraries`), RxJS and Observable.
8. **Migrating from**: redux-saga, Effector, mitt and EventEmitter, RxJS.
9. **Server**: stop work when the client leaves.
10. **Reference**: Semantics, Plugins, Tracing, Stability, Hot reload.
Groups are collapsible and the one with the current page is open, so a long list does not hide the page.

The nested links need anchors, and today `policies.md` and `effects.md` have headings per topic, not per policy or effect. Each policy and effect gets a short heading (`### latest`) with a one-line description, the signature and a link to the section that explains it in full, placed in one reference part of the page (a table of what each does comes first). This also lets the on-page table of contents (the right-hand outline of VitePress, and the `## On this page` list) show them. The sidebar test resolves each nested link against the headings of the page with the GitHub slug rules and fails on an anchor that does not exist (VitePress does not check anchors).

### `docs/recipes.md`: an index, not content

A page of links ordered from simple to complex, grouped by symptom ("an old response overwrites a new one", "a second click sends a second request", "the request must stop when the user leaves", "an unreliable network", "a form with checks", "a server that must stop work", "I already use Redux"). Each entry is one line plus a link. The page has no code of its own, so it cannot go stale in a way `docs:check` would miss. It is added to `llms.txt` (required by `llms:check`) and both sidebars. Adding a page is justified here by the owner's explicit demand for recipes, against the rule that the surface does not grow without demand; it is docs, not API.

### Russian pages in `docs/ru/`, same names

`docs/ru/guide.md` mirrors `docs/guide.md`; the home page is `docs/ru/README.md`. One file per page per language makes a missing translation visible and keeps GitHub and npm readers able to find the Russian text. Relative links between pages are unchanged; a link out of docs has one more `../`, which `repositoryLink` already resolves against the page path.

### VitePress locales

`locales: { root: { label: "English", lang: "en" }, ru: { label: "Русский", lang: "ru-RU", themeConfig: { sidebar: ruSidebar } } }`, local search with Russian UI strings, `rewrites` for `ru/README.md` to `ru/index.md`. The Russian sidebar titles are translated; links are `/ru/<page>`.

### Code: identical except comments

Translators change prose, headings, table text and snippet comments, not code, identifiers, strings in code or file names. The parity check in `docs-check.mjs` compares each Russian block with the English one at the same index: same fence language and, with comments removed, the same text. A different block count or a changed line fails and names both files. Russian blocks are also type-checked, so a stale snippet cannot hide in one language. Translating strings in code is not allowed: the reader would copy code that differs from the tested one.

### Order of work and how the translation is done

Review and fix English first, level by level; the owner reads the report; then translate. The translation runs in batches by level, each batch checked by `docs:check` (types and parity) before the next. The glossary below keeps terms the same on every page; API names in code font are never translated. The owner reads Russian, so the level A and B pages get a read before the rest is translated.

Glossary: bus — шина, handler — обработчик, task — задача, policy — политика, effect — эффект, abort — прерывание, cancel — отмена, listener — слушатель, recipe — рецепт. It lives in `review.md`, not on the site.

## Risks / Trade-offs

- Prose drifts: an English edit can leave the Russian page stale and no check sees it. AGENTS.md gets a rule that a change to a page edits both; the parity check catches changed code only.
- Maintenance doubles for every docs change; the review reduces churn by fixing the English first.
- The package grows by about 400 kB of Markdown. If it matters, `files` can exclude `docs/ru` later; the site and GitHub are unaffected.
- A translation can change the meaning of a subtle rule (abort, ordering in `semantics.md`). Those pages are translated with the English next to them and read once by the owner.
- Block parity assumes the translator does not reorder or merge blocks; a mismatch reports the index, so the fix is local.
- A review that fixes prose and a parallel translation would conflict: that is why the translation starts only after the review of the same level is done.
