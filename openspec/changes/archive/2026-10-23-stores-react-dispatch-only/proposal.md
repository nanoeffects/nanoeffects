# Proposal

## Why

The `useState` half of "React: useState and useDispatch as sources" in `docs/stores.md` is not about connecting a store: there is no store in it, only a component with a bus. It also needs two effects, a module-level bus and a skipped empty query, which makes the page heavier than the job of "Connect Redux, Zustand, MobX, or Pinia". The `useDispatch` half is the real case for this page: a Redux component, no bus call in it.

## What Changes

- Remove the `useState` explanation and example from `docs/stores.md`.
- Rename the subsection to "React: useDispatch as a source" and fix its entry and anchor in "On this page".
- Keep the `useDispatch` example as it is; drop the closing sentence that mixes both sources.
- Change the `docs-react-sources` requirements to the Redux-only version.
- Change the CHANGELOG line (still `Unreleased`) to match.

## Capabilities

### New Capabilities

### Modified Capabilities
- `docs-react-sources`: the Stores page shows one React source, Redux `useDispatch`, not two.

## Impact

- `docs/stores.md`, `CHANGELOG.md`, the main spec `openspec/specs/docs-react-sources/spec.md` (including its Purpose line).
- `llms-full.txt` is built from `docs/` and not committed, so nothing to edit by hand; `llms.txt` links pages only and does not change.
- No change in `src/`, `examples/`, the playground or the package.
