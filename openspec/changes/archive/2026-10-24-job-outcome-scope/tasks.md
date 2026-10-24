# Tasks: job-outcome-scope

## 1. Behavior
- [x] 1.1 In `send` (`src/actions/job.ts`), when the outcome creator carries a scope, pass the job's scope with the action's over it (fields and `effects` merged one level deep); otherwise pass the job's scope as before. Verify: `src/scope/places.test.ts` has a case where job and outcome action both set a field and `effects`, and the listeners see the action's value, the job's other fields, and the handler still sees the job's; and a case with an outcome action without a scope that sees the job's scope

## 2. Docs and release notes
- [x] 2.1 One line in the job section of `docs/scope.md` (the outcome action's own fields win over the job's) and a CHANGELOG `Unreleased` entry. Verify: `pnpm docs:check`

## 3. Verify
- [x] 3.1 `pnpm format && pnpm tsgo && pnpm check && pnpm docs:check && pnpm llms:check && pnpm vitest run && pnpm build && pnpm size`. Verify: all green, `nanoeffects/actions` within its limit
