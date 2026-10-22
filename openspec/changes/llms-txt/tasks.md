# Tasks

## 1. The index

- [x] 1.1 Write `llms.txt`: heading, summary (ESM only, `ctx` first for effects, `bus.on` returns unsubscribe, one import path per entry), and sections with the pages of `docs/` in reading order, each with a one-line description. Check the summary rules against `docs/guide.md` and `docs/effects.md`.

## 2. Generator and check

- [x] 2.1 Add `scripts/llms-full.mjs` with `readIndex` (links of `llms.txt`), `buildFull` (summary, then each page under a `Source:` line, deterministic) and `checkIndex` (every `docs/*.md` except `docs/README.md` linked once, every link resolves, every `nanoeffects/<entry>` of the summary is in `package.json` `exports`).
- [x] 2.2 CLI: no arguments write `llms-full.txt`; `--check` runs `checkIndex` only and exits non-zero with the file and the reason.
- [x] 2.3 Tests in `scripts/llms-full.test.mjs` on fixture trees (a temp folder): unlinked page fails; dead link fails; unknown entry in the summary fails; order and `Source:` lines; two runs give identical bytes; page text unchanged.

## 3. Wire it in

- [x] 3.1 `package.json`: `files` gets `llms.txt` and `llms-full.txt`; `build` runs `node scripts/llms-full.mjs` after tsdown; `"llms:check": "node scripts/llms-full.mjs --check"` joins `verify`.
- [x] 3.2 `.gitignore`: `llms-full.txt`. CI: add `pnpm llms:check` next to `docs:check`.
- [x] 3.3 `AGENTS.md`: Commands (`llms:check`), Layout (`llms.txt`, `scripts/llms-full.mjs`) and one line in Documentation: a new docs page is added to `llms.txt`.

## 4. Docs, changelog, final check

- [x] 4.1 `docs/package.md`: a short paragraph on `llms.txt` and `llms-full.txt` (what they are, where: `node_modules/nanoeffects/`, unpkg). `docs:check` must still pass.
- [x] 4.2 `CHANGELOG.md` entry under Unreleased.
- [x] 4.3 `pnpm build && pnpm pack --dry-run`: both files listed, `git status` shows `llms-full.txt` ignored; note the size in design.md (Risks).
- [x] 4.4 Read `llms-full.txt` once, as an assistant would, and fix a summary line or a page description that misleads.
- [x] 4.5 `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm vitest run && pnpm build`, then `pnpm verify`; it must pass.
