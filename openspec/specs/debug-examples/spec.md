# debug-examples Specification

## Purpose
Gives a reader runnable, tested debugging scenarios and a Redux DevTools playground, so each tracing tool can be seen working before it is used in an app.

## Requirements

### Requirement: A folder of debugging examples can be run and gives the same result each time
`examples/debug/` SHALL hold small scenarios, each a file with a `run()` function that builds its own bus, runs one situation and returns what it found (the reports, the cycles, the exports). Each SHALL also run alone from a terminal with one command (`npm run <name>`), print what a reader should look at, and end by itself. Time SHALL come from a clock the scenario controls, or a short fixed delay, so the output does not change between runs.

#### Scenario: One scenario from a terminal
- **WHEN** a reader runs `npm run loop-two-handlers` in `examples/debug`
- **THEN** a cycle report with the path is printed, the program ends, and the output is the same on the next run

#### Scenario: Each scenario returns its findings
- **WHEN** a test imports a scenario and calls `run()`
- **THEN** it gets the reports and the exports as values it can assert on

### Requirement: The scenarios cover the situations the tools are for
The folder SHALL have a scenario for each of these, with a README line that says what to look at: a loop between two handlers; an event whose handler emits the same event; a loop across `await` and a timer; a loop made of microtasks that `loopGuardPlugin` cuts; a loop across two modules; a component that emits on every render (a storm) with `maxPerSecond`.

#### Scenario: The list is complete
- **WHEN** the README of `examples/debug` is read
- **THEN** each situation above has a row with the command, what it shows and what to look at

### Requirement: The scenarios also cover payloads, clean flows and failures
The folder SHALL also have a scenario, with a README line, for each of these: a payload that holds a class instance, a `Map`, a circular reference and an `Error`, exported with `toJSON({ payload: true })`; a flow with no cycle (a diamond and a fan-out) that is reported clean; a recursion that is legitimate and left out with `ignore`; and a failing handler in the middle of a chain.

#### Scenario: A clean flow
- **WHEN** the no-cycle scenario runs
- **THEN** no cycle is reported and the exported graph has no marked edge

### Requirement: The exports can be seen without a tool installed
A scenario SHALL write its graph as `graph.mmd`, `graph.dot` and `graph.json` into an `out/` folder that git ignores, and the README SHALL say how to see each (a Mermaid viewer, `dot -Tsvg`, any JSON reader). The browser playground SHALL draw the Mermaid text of the current graph on the page.

#### Scenario: Files are written
- **WHEN** the export scenario runs
- **THEN** the three files exist in `out/` and the Mermaid one starts with `flowchart`

### Requirement: There is a browser playground for Redux DevTools
`examples/debug-playground` SHALL be a page that runs on StackBlitz or locally (`npm run dev`), with one button for each looping scenario, `graphLogger({ devtools: true })` connected to an instance named `debug playground`, `reduxDevtools` for the emits, and the Mermaid drawing of the graph.

#### Scenario: A button starts a loop
- **WHEN** a reader presses the button of a loop with the extension installed
- **THEN** a `cycle/detected` action with the path appears in the extension, the page shows the report, and the graph is drawn with the cycle marked

#### Scenario: The guard button
- **WHEN** the reader turns the guard on and presses the microtask loop button
- **THEN** the page stays responsive, the loop stops, and the report says the limit was reached

### Requirement: The playground README says how to use Redux DevTools
The README SHALL say that Redux DevTools is a browser extension, that the preview must be opened in its own tab, and what to see in the extension after each button (the `cycle/detected` action with the path, the running tasks in the state).

#### Scenario: No extension
- **WHEN** the extension is not installed
- **THEN** the page still shows the report and the graph, and nothing throws

### Requirement: The examples are tested so they do not rot
`src/tests/debug-examples.test.ts` SHALL run every scenario with `run()` and assert its findings (the path of each cycle, the count of reports, that the clean flow is clean, that the export is valid). The examples SHALL be type-checked by `pnpm tsgo` with the rest of the repository, and the architecture and docs checks SHALL cover them.

#### Scenario: A scenario stops reporting
- **WHEN** a change makes a looping scenario report nothing
- **THEN** the test fails and names the scenario

#### Scenario: Type check
- **WHEN** `pnpm tsgo` runs
- **THEN** the scenarios and the playground type-check against `src`

### Requirement: A docs page walks through the situations
`docs/debugging-loops.md` SHALL be a how-to page for level F that starts with the symptom (the page freezes, a request repeats, a store flickers), then shows how to find the loop with `graphLogger`, read the report, draw the graph, see it in Redux DevTools, and cut it with `loopGuardPlugin`, using the code of the scenarios. Every code block SHALL be checked by `pnpm docs:check`, and the page SHALL have a Russian version.

#### Scenario: Start from a symptom
- **WHEN** the page is read
- **THEN** its first section lists the symptoms and sends each to the scenario and the section that fits

#### Scenario: Blocks are checked
- **WHEN** `pnpm docs:check` runs
- **THEN** every block of the page passes and the Russian page has the same code
