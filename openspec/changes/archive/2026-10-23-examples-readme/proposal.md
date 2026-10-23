# Proposal

## Why

The README must stay at levels A and B, but it now carries two playground links in one sentence and a bare `[Examples](examples)` link to a folder with no page of its own. A reader who wants a recipe or a playground has no index to pick from.

## What Changes

- Add `examples/README.md`: an index of the playgrounds (DOM and React, with StackBlitz links and how to run them locally), the single-file recipes with the docs page each belongs to, and the TypeScript projects.
- README: keep one sentence with the DOM playground link right after the install section, and point the Examples link at `examples/README.md`. The React playground link moves to the examples index.
- Change the playground requirement that put the React link in the README.

## Capabilities

### New Capabilities

### Modified Capabilities
- `playground`: the React playground is linked from the examples index, not from the README.

## Impact

- `README.md`, new `examples/README.md`, the main spec `playground`.
- No change in code, the package or `docs/`; `examples/README.md` is not part of the published package.
