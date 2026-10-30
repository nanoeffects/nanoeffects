# Tasks

## 1. The project

- [x] 1.1 Create `examples/trades/` with `package.json`, `tsconfig.json`, `index.html`, `src/bus.ts`, `src/trades.ts`, `src/App.tsx`, `src/main.tsx`. Check `retry` accepts a growing `delay` and no limit of attempts; if not, update design.md first. Verify with `pnpm tsgo` and `pnpm check`.
- [x] 1.2 Check in a browser against the real stream: the list grows, another pair closes the old socket (Network panel, WS tab) and opens a new one, switching the network off and on shows reconnecting and then live, and the list is rebuilt at the throttled rate while the bus gets every trade.

## 2. Index and docs

- [x] 2.1 Write `examples/trades/README.md` (what each action does and which wrapper does it, the note on regions), add the row to `examples/README.md` and the line to `CHANGELOG.md` under `Unreleased`.
- [x] 2.2 Decide on a docs recipe for streams; if yes, add the page, link it from `llms.txt`, and run `pnpm docs:check` and `pnpm llms:check`.
- [x] 2.3 Run `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm vitest run && pnpm build`. Verify all pass.
