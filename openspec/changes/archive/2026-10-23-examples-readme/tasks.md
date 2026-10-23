# Tasks

## 1. Examples index

- [x] 1.1 Create `examples/README.md`: playgrounds (DOM and React: StackBlitz link, what it shows, how to run locally), single-file recipes with their docs pages, the TypeScript projects, and a note that the files are type-checked by `pnpm tsgo` and the copy-paste path is the JavaScript in `docs/`.

## 2. README

- [x] 2.1 `README.md`: one sentence with the DOM playground link right after the install section; the React link removed; the `[Examples]` link points at `examples/README.md`.

## 3. Verify

- [x] 3.1 Every link of the new page resolves (files exist, anchors exist); `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check`; `pnpm pack --dry-run` lists no `examples/` file.
