# Design

## Context

`create-nanoeffects` (`packages/create-nanoeffects/index.js`) lists its templates in one array and copies `templates/<name>` into the target, renaming `_gitignore`; the question, the validation and the error text are built from that array. The JavaScript templates are excluded from biome (`packages/*/templates`) and are not compiled in the repository. The specs `starter-templates` and `create-starter` come from `add-create-nanoeffects` and are not archived yet. See proposal.md for why.

## Goals / Non-Goals

**Goals:**
- A TypeScript starter that is the same app as the JavaScript one, so the reader compares two files, not two apps.
- Show the typed path of the library: types from `createAction<Payload>`, nothing to annotate in components.
- Keep a starter from rotting: the repository compiles it.

**Non-Goals:**
- Converting or detecting the language of an existing project.
- A `--typescript` flag or a combined template name scheme such as `react+ts`: the four names are plain and listable.
- Lint, formatting or tests in the templates.

## Decisions

- **Two more directories, not a transform.** `templates/vanilla-ts` and `templates/react-ts` are written by hand. A build step that derived TS from JS (or the reverse) would hide the code the reader copies, and the two languages differ in places (`api.ts` signatures, `main.tsx` null check). Cost: four near-duplicate trees; the check below keeps the TS pair honest.
- **Names `<shape>-ts`.** `vanilla` and `react` stay as they are, so no existing command changes meaning. The array in `index.js` becomes `["vanilla", "react", "vanilla-ts", "react-ts"]`; the prompt and the error text already join the array.
- **Events carry the types.** `search.ts` has `createAction<string>("search/queryChanged")` and `createAction<string[]>("search/loaded")`. Handlers, `bus.emit(queryChanged(...))` and `useEventState(searchLoaded, [])` are typed from them. The bus is `createBus()` with no event map, because a creator with a payload type needs none. `search.ts` imports no bus and `bus.ts` imports no events, as in the JS twin.
- **`tsconfig.json`:** `strict`, `moduleResolution: "bundler"`, `module/target: ESNext`, `noEmit`, `isolatedModules`, `skipLibCheck`, `types: ["vite/client"]` where CSS or env types are needed, `jsx: "react-jsx"` for React. `package.json` adds `typescript` (and for React `@types/react`, `@types/react-dom`) to `devDependencies`, and `build` is `tsc --noEmit && vite build`. Vite does not type-check by itself, so without that script a type error would only show in the editor.
- **React config in TS.** `react-ts` has `vite.config.ts` (the JS twin has `vite.config.js`); `index.html` points at `main.ts` or `main.tsx`.
- **Check from the repository, not from the package.** A script (`scripts/templates-check.mjs`, run by `pnpm verify`) writes a `tsconfig` in a temp directory that extends the template's own and adds the `nanoeffects/*` `paths` of the root `tsconfig.json`, then runs `tsc`. This reuses the mapping `docs:check` uses and needs no install and no build. Alternative: install the packed tarball into a copy (what `consumer-check` does) — closer to a user, but slower and needs `dist`; it stays a manual step before a release.
- **Docs.** `docs/starter.md` gets two rows in the templates table, a sentence when to pick TypeScript (you want the compiler to check events and handlers), and the files table lists `.ts` names next to `.js`. TypeScript appears only there, in line with the JS-first rule for docs.

## Risks / Trade-offs

- [Four trees drift apart] → the check compiles the TS pair against the sources; `index.test.js` checks that each listed template has the same set of base names as its twin.
- [`nanoeffects: "latest"` in the templates] → unchanged from the JS templates, and the command rewrites it to the version it came with.
- [A TS template needs a hook that is not released] → `react-ts` uses `useEventState`, which exists from the release of `add-use-event-state`; ship both in one release.
- [The check uses `src`, users get `dist` types] → the same `.d.ts` are generated from `src`; `pnpm consumer-check` with a tarball before a release covers the packed result.
