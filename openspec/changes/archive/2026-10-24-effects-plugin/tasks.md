# Tasks: effectsPlugin

## 1. Core hook
- [x] 1.1 Add optional `addContext` to `Bus` (writable, documented as a plugin slot); call `bus?.addContext?.(ctx)` in `createTask`
- [x] 1.2 Measure `createBus` gzip (1419 → 1427 B, +8) and task creation (one property read without a plugin; not benchmarked)

## 2. Plugin
- [x] 2.1 `src/effects/plugin.ts`: `effectsPlugin`, hand-written `Bound` table for `race`, `all`, `allSettled`, `take`, `delay`; chain `previous`
- [x] 2.2 Export only `effectsPlugin` from `src/effects/index.ts`
- [x] 2.3 Remove `src/core/context-method.ts`, the `createTask` rebind, `BusPlugin`. The `module.ts` type change stays: it fixes a `tsgo` error already in HEAD (`MadeCommand` in `m.use`)

## 3. Tests
- [x] 3.1 Runtime: destructured `race` / `all` / `take` match free forms; abort parity; child tasks get helpers; existing `context` (object and function) kept; two plugins chain `addContext`
- [x] 3.2 Types: `(id, { race })` inferred and wrong args fail; accumulates with `WithContext<{ store }>`; unsupported helper is an error
- [x] 3.3 Leak: many tasks, `WeakRef` to ctx collectable when `global.gc` exists

## 4. Docs
- [x] 4.1 One section in `docs/effects.md` (JS first) and one link in `docs/context.md`; `package.md` entry
- [x] 4.2 Revert plugin edits in `docs/guide.md`, `README.md`, `docs/README.md` and other sections of `effects.md`
- [x] 4.3 `AGENTS.md` one line (refining plugin returns typed bus; `addContext` slot); CHANGELOG Unreleased

## 5. Verify
- [x] 5.1 `pnpm format && pnpm tsgo && pnpm check && pnpm vitest run && pnpm build`
