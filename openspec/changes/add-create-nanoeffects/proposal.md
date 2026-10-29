# Proposal

## Why

A new reader has to build a project by hand before they can try the bus: install Vite, wire the files, copy the README example. `npm create nanoeffects` gives the level A/B reader a running project with one command, and puts the recommended file layout (bus, events, handlers) in front of them from the first minute.

## What Changes

- A new npm package `create-nanoeffects`, in `packages/create-nanoeffects/` of this repository. `npm create nanoeffects@latest my-app` (also `pnpm create`, `yarn create`, `bun create`) copies a template into `my-app`, writes the installed version of `nanoeffects` into its `package.json`, and prints the next steps.
- Two templates, in JavaScript: `vanilla` (Vite, a bus and one `latest` handler) and `react` (Vite, `useEmitter` and `usePolicy`).
- The CLI has no dependencies. It asks for a name and a template when it is run in a terminal and they are not given, and takes `--template` and a directory name for scripts.
- The package has the version of `nanoeffects` and is released with it: one tag, one workflow, `nanoeffects` first. npm trusted publishing is set up for the new package too.
- The root `pnpm-workspace.yaml` lists `packages/*`; the templates are outside the root `tsconfig`, Biome check and `size-limit`.
- A new docs page `docs/starter.md` (level A) and an entry in `llms.txt`; the README install section gets one line with the command.
- An integration test scaffolds both templates from the packed packages, installs, builds with Vite and runs the result.

## Capabilities

### New Capabilities
- `create-starter`: what the `create-nanoeffects` command does: arguments, prompts, the files it writes, what it refuses, and how its package is released with `nanoeffects`.
- `starter-templates`: what a template must be: a project that installs, builds and runs against the published `nanoeffects`, in the file layout the docs teach.

### Modified Capabilities

None. `llm-docs` already requires every docs page in `llms.txt`; the new page follows it.

## Impact

- New: `packages/create-nanoeffects/` (CLI, templates, `package.json`, README), `docs/starter.md`, `integration/starter.test.ts`.
- Changed: `pnpm-workspace.yaml`, `biome.json` (templates ignored, CLI source checked), `package.json` scripts (`check`, `lint:package`), `.github/workflows/release.yml` and `ci.yml`, `llms.txt`, `README.md`, `CHANGELOG.md`, `AGENTS.md` (layout and release sections).
- Dependencies: none at runtime for the CLI. The templates depend on `nanoeffects`, `vite` and, for `react`, `react`, `react-dom` and `@vitejs/plugin-react`.
- The library itself (`src/`) and its size limits do not change.
