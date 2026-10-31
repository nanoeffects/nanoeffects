# Review of the English docs, as a newcomer

How it was done: every page of `docs/` was read in full, in the order a newcomer asks (what is it, install, first example, recipe, next step, where am I), and again while it was translated. It was a reading pass, not a test with real newcomers: nobody followed the pages from zero. The findings below are what the pass found; "left" means a decision for the owner.

## Checklist

1. What is it, and do I need it? Purpose in the first lines, and a way out when it is not needed.
2. How do I install it? Command, supported versions, ESM only.
3. How do I start? A first example that runs, with every name defined or marked as the app's own.
4. Where is my recipe? Reachable by the problem, not by an API name.
5. What next? The end of a page names the next step for its level.
6. Where am I? Level A to F near the top.
7. The standing rules of AGENTS.md (one idea per paragraph, JS first, types explained, local names, one step per line, comments on library calls, headings name the job).

## Findings

| Page | Finding | Result |
| ---- | ------- | ------ |
| README | The first snippet used `analytics` and the second `api` with no word that they are the app's own. | Fixed: `console.log`, and a comment that `api` is your own client. |
| README | Install was one line; no pnpm/yarn, no Node version, ESM only unexplained. | Fixed: one paragraph and a link to the supported versions. |
| README | No link to the docs site. | Fixed: one link, with the Russian site. |
| docs/README | Three things in one page (ladder, jump table, flat list of every page). Levels A to F of AGENTS.md were invisible. | Fixed: rewritten as the map of levels with "stop here when" and the first page of each; the flat list is trimmed to the reference pages. |
| (new) recipes | Recipes were spread over about twelve pages with no index. | Fixed: `docs/recipes.md`, by problem, simple first, links only. |
| guide | One paragraph held four calls (`once`, `off`, `off()`, `get`); the match-function and `"*"` sections sat inside step 1 although they are level B; no install pointer; the table had no levels. | Fixed: bullets, a note that the two sections can be skipped, a level column, an install pointer. |
| motivation | The first screen is about SDKs and Module Federation; "when this is not the right tool" was at the bottom. | Fixed: a link to that section in the intro, and a line that a small app with one request does not need the library. |
| starter | None. | OK. |
| package | None. | OK. |
| policies | No entry per policy; `key` and `withPolicy` were not in the table; the page had no short list to link to. | Fixed: "Look up a policy", one `###` per policy. |
| effects | The section "Wait for the next event with `take`" began with `ctx.on` text, so the heading did not match the content; no entry per effect. | Fixed: split into "Listen for events inside a task" and the `take` section; "Look up an effect" added. |
| errors | Said `onUnhandled` is not called for actions. An action without a handler is only an event, and it is called. `import.meta.env.DEV` unexplained. | Fixed. |
| actions | `createAction` listed twice in one sentence. | Fixed. |
| context | `store` appears with no word that it is the app's own object. | Fixed: one sentence. |
| plugins | A repeated word in a comment; a link to an anchor that no heading has (`#let-a-test-replace-a-handler-commandsplugin`). | Fixed. |
| stability | The table did not list `fromSignal` and `events`. | Fixed. |
| every page | No level and no prerequisite near the top. | Fixed: a line under the title of every page (`> **Level B.** Read first: ...`). |
| the site | VitePress makes heading ids that differ from GitHub (an `_` before a leading digit, a hyphen for a dot), so `#1-create-a-bus` and `#keep-the-chain-ctxemit-not-busemit` did not hit on the site. | Fixed: the config uses the GitHub rule (`.vitepress/slug.ts`), and a test checks every link to a heading in both languages. |
| stores | 671 lines in one page (Redux, six state managers, React recipes). | Left: it reads well from its table of contents; splitting it is a separate change. |
| oop, scope, tracing | Long and dense, but each has "On this page" and a first-lines goal. | Left. |
| semantics | Titled "Semantics", says "exact rules of emit, abort and ordering", but has 21 lines. A reader who comes for the rules finds five bullets. | Left: expanding it needs the owner's rules, not a rewording. |
| README, docs | Many snippets use `api` as the app's own client. It is named in the prose of the main pages, and declared for `docs:check` in `scripts/docs-stubs.d.ts`. | Left: acceptable for a placeholder; an example that runs as is needs a real endpoint. |

## Glossary used for the Russian pages

bus — шина, handler — обработчик, task — задача, policy — политика, effect — эффект, abort — прерывание (прервать), cancel — отмена (отменить), listener — слушатель, recipe — рецепт, action — действие, job — задача (job), module — модуль, scope — scope (область), starter — стартер, payload — нагрузка. API names, `ctx` fields and code are not translated.
