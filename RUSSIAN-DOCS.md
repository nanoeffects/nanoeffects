# Rules for the Russian documentation (`docs/ru/`)

Read this file before you change any page of `docs/ru/`. [AGENTS.md](AGENTS.md#russian-pages) has the rules for keeping `docs/` and `docs/ru/` in step; this file says how the Russian text is written. The owner talks to you in Russian, so the rules below are in English only to match the rest of the repository, and the examples are Russian.

## Role

You edit the translated technical documentation as a Russian-speaking technical writer who knows the English terms of IT. The goal: a text that reads as if it was written in Russian, not translated.

## Meaning and terms

- Remove calques from English. Wrong: «гибкий» for Agile, «контроль источника» for version control, «сдаётся через пять секунд» for «gives up after five seconds» (write «прерывается»), «охранник типа» for type guard (write «функция-type guard»).
- A term that the Russian IT community leaves in English stays in English: API, PR, commit, CLI, callback, middleware, payload, action, job, scope, starter. Do not decline the terms of this library's API. The list of fixed terms is in AGENTS.md (Russian pages): bus — шина, handler — обработчик, task — задача, policy — политика, effect — эффект, abort — прерывание, listener — подписка or обработчик, server — backend or Node.js.
- Keep the technical meaning. Do not "improve" a statement: if the English is unclear, ask or fix the English first.
- Do not translate names of variables, functions, methods, config keys, paths or strings in code.

## Style

- No passive voice where an imperative is natural: not «файл должен быть запущен вами», but «запустите файл».
- Short, natural sentences. No bureaucratic phrases («осуществляется», «производится», «данный»).
- Address the reader in the imperative («нажмите», «настройте»), never in the infinitive. One style on every page.
- A heading is a noun phrase in the nominative case, on every page: «Создание шины событий», «Прерывание предыдущих запусков», «Работа с ошибками», «Модули». Never an imperative («Создайте», «Выберите», «Верните», «Покажите», «Найдите»), and never «(необязательно)» in the heading: say it in the first line of the section. The heading of a task on the page of common tasks may be an infinitive («Получить результат от emit»), because it names the job to do. A heading that lists what a step covers lists it: «Другие политики: `leading`, `debounce`, `throttle`, `queue`».
- Examples of people use «MVP», not «прототип» («прототип» is also a JavaScript word). Say «отправка сообщений», not «отправка», and «размонтирование компонентов», not «уход со страницы».

## The first lines of a page

- Every page except the main one starts with a line that says its level and links to the table of levels on the main page: `> **[Уровень B](README.md#виды-проектов)**: SPA с async UI. Сначала прочитайте: [Руководство](guide.md#1-создание-шины-событий).` The words after the colon describe the project in the same words as the table on the main page, so a reader who never saw that table still knows whether the page is for them.
- Do not write «шаги 1–3» next to a link to the guide. The links already point at the right step.
- A page that the main page does not list by level (a range, such as «Уровни A–F») links the table the same way.

## The main page (`docs/ru/README.md`)

The main page is for someone who just arrived. It has, in order: two short sentences about what the library does (business logic and side effects out of the UI, with policies and effects), one minimal example, the install commands (two separate `bash` blocks, so a command never wraps), where to start, the table of project levels, the reference list. It does not have a list of imports and it does not argue why the library exists: `motivation.md` is in the side bar. The code of its blocks must match `docs/README.md` (only comments may differ).

## Markdown

- Keep every link, inline code, code block, bold, italic, list and heading of the original. Do not break the syntax.
- A heading change changes its anchor (GitHub slug: lowercase, spaces to `-`, no punctuation). Change every link to it in `docs/ru/`, then run `pnpm vitest run tools/docs-site`, which checks the links.
- A code block of a Russian page equals the block of the English page except for comments (`pnpm docs:check`).

## Check

```bash
pnpm docs:check && pnpm llms:check && pnpm vitest run tools/docs-site
```

## The page of common tasks (`docs/ru/recipes.md`)

The file is `recipes.md`, the title is «Типовые задачи» (English: «Common tasks»). Every task has the same shape: a heading that names the task, one or two sentences with the problem as a short story (what the user does, what goes wrong), a short code block with the solution, and, only when the page has more to say, a last line «Подробнее: …» with a link. A task whose problem cannot be told in two sentences is not a task: its place is the page of its topic, or the list of examples at the end. Do not use the word «starter» in text that is new. Whole-app examples, `OOP` and `TypeScript` go to the end of the page. Code of the blocks equals the English page (`pnpm docs:check`).

## Reference pages: effects and policies

- A reference page (`effects.md`, `policies.md`) opens with a list: the name of each effect or policy as a link, a dash, and a short description of what it is for, in natural words («повторить вызов после ошибки», not «Повтор»). The list is a bulleted list, one item per effect, never one paragraph.
- Each effect has its own section named after it (`## \`retry\``). The section holds: one or two sentences with what it does and why you need it; the forms of the call; **its own options** (not a shared section for several effects, unless the options are really shared, as for `debounce` and `throttle`); an example; the cautions. Do not name a section «Оберните X в Y» when it describes an effect.
- A section that has a bare mechanism (`cancellable`, `onAbort`, `ctx.on`) says why you would use it before the code.
- A default value is named only where the option is described, never earlier.
- Do not mention tests in the text («тесты сравнивают …»). Say what is true: «ведёт себя так же, как в lodash».
- A short form of the policies or effects page entry has a separate line «Подробнее: …» with the link.

## Words

- Write `payload` in English everywhere, never «нагрузка» (except «под нагрузкой» in the sense of load on a server). Do not decline it.
- Say «action» where older text said «событие» for something made with `createAction`: one term, not two. A plain event name that is a string stays «событие».
- `Promise` stays in English in Russian text, never «промис». Do not decline it (`Promise`, not «Promise-а»).
- Do not use the word «starter» in new text. Say «функция группы» (a function that `all`, `allSettled`, `race` or `timeout` calls with its `child`), or describe what it does. The type `StarterOf` keeps its name in code.
- A subscription that a task or a component opens must be closed: when you write about `ctx.on`, `bus.on` or a listener, say how it ends (abort, unsubscribe, `take`, a module). The same goes for the English docs.
