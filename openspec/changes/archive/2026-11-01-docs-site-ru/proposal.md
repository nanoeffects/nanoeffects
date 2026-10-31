## Why

The docs are English only, and the owner and part of the audience read Russian. Before translating, the English pages need a hard review from the point of view of a newcomer: someone who does not know the library and asks, in order, "what is this and do I need it", "how do I install it", "how do I start using it", "where are recipes for my case", "what do I read next". A translation would copy every unclear paragraph into a second language and double the cost of fixing it later.

A first look at the entry points already shows gaps: the first README snippet uses `analytics` and the second `api` without saying where they come from; the docs index mixes a ladder, a jump table and a flat reference list; recipes are spread over a dozen pages with no single index; nothing says "you can stop here" at a level.

## What Changes

- Review all 34 pages of `docs/` and the README critically as a newcomer would read them, and fix what the review finds in `docs/*.md`. The review follows the Documentation section of AGENTS.md and a newcomer checklist (what is it, install, first working example, first recipe, next step, where am I on the ladder). It changes wording and structure, not behavior or the API.
- Make the ladder from level A to F explicit: `docs/README.md` becomes the map (what each level is, "you can stop here if", the first page of each level, the prerequisites), and each page says at the top which level it is for and what to read before it.
- Add one page, `docs/recipes.md`: an index of recipes by the problem the reader has ("old response overwrites a new one", "double submit", "cancel on a server when the client leaves"), each a link to the page or section that solves it, in order from simple to complex. No new recipe content is duplicated there.
- Regroup the sidebar by what the reader is doing, not by file: Start, Async UI recipes, Effects and policies (with each policy and effect as a short nested link), Domain logic, Frameworks (React, Vue, Svelte, classes), Libraries and stores (Redux, Zustand, MobX, Pinia, React Query and others), Migrating from, Reference. Frameworks are grouped together and so are libraries.
- Give every policy (`latest`, `leading`, `debounce`, `throttle`, `queue`, `key`) and every effect (`retry`, `timeout`, `poll`, `take`, `all`, `race`, `backoff`, ...) a short heading on `policies.md` and `effects.md` (what it does in one line, the signature, a link to the full recipe), so the sidebar and the on-page table of contents list them as short links.
- Add a Russian translation of every page (35 with `recipes.md`) in `docs/ru/`, same file names, so GitHub and the npm package show it too.
- Publish it as a locale of the site (`/ru/`) with a language switcher, a Russian sidebar and Russian search.
- Extend `pnpm docs:check` to the Russian pages, and add a parity check: the code of a Russian block equals the English one, except comments.
- Extend the sidebar test to both locales, and to check that every nested link points at a heading that exists.
- Out of scope: translating `README.md`, `llms.txt`, `CHANGELOG.md`, `AGENTS.md`, comments in `src/`, `examples/`; other languages; versioned docs; machine translation at build time; any change to the library API.

## Capabilities

### New Capabilities
- `docs-ru`: the Russian pages in `docs/ru/`, their parity with the English pages and the checks that keep them in step.
- `docs-onboarding`: what a newcomer must find in the docs, in order: purpose, install, first example, recipes, next step, and the level of each page.

### Modified Capabilities
- `docs-site`: the sidebar requirement covers every locale.

## Impact

- New: `docs/recipes.md`, `docs/ru/*.md` (35 files, about 7,500 lines). `docs/` is in the npm package (`files`), so the package grows by about 400 kB of Markdown.
- Changed: `docs/*.md` (review fixes; `docs/README.md` rewritten as the map), the README if the review finds a gap in its first snippets, `llms.txt` (one line for `recipes.md`; `llms:check` requires it), `tools/docs-site` config and sidebar, `tools/docs-site/docs-site.test.ts`, `scripts/docs-check.mjs` and its test.
- `llms.txt` and `llms-full.txt` stay English and flat: `llms:check` reads `docs/*.md` only, so `docs/ru/` is invisible to it.
- Every later change to an English page needs the same change in `docs/ru/`; the parity check catches changed code, not changed prose (see design.md).
