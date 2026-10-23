# Tasks

## 1. React playground

- [x] 1.1 Simplify `examples/playground-react/`: `bus.ts` with the bus, a `trace` constant (`createTracer(consoleLogger())`) and the `debounce` + `latest` handler; `App.tsx` with one input and the results; `fake-api.ts` without the report callback; drop the own store, the page lists and `reduxDevtools`; page text points at the console.
- [x] 1.2 Check in the browser: fast typing starts one request; a newer query shows `cancel` in the console and only the last result on the page.

## 2. DevTools playground

- [x] 2.1 Create `examples/playground-devtools/` (`package.json`, `index.html`, `main.ts`, `fake-api.ts`): the search of the DOM playground, a `trace` constant `createTracer(reduxDevtools({ name: "search playground" }))`, and a page note on the extension, the own tab and picking the instance by name.

## 3. Index and changelog

- [x] 3.1 `examples/README.md`: three playgrounds in the table; the DevTools note moves to its row.
- [x] 3.2 `CHANGELOG.md`: edit the `Unreleased` line of the playgrounds.

## 4. Verify

- [x] 4.1 `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check`; `pnpm pack --dry-run` lists no `examples/` file.
