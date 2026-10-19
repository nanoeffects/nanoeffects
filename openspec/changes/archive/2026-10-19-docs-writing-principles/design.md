# Design

## Context

See proposal.md — Why. Docs today mix onboarding and reference (e.g. README Entries, full effects catalogs). Assistants need durable rules keyed by **project level**, plus a gate for whether a section belongs on a page. Business logic off the UI is a real audience (level D); BA-readable tooling is not in scope yet.

## Goals / Non-Goals

**Goals:**

- Encode principles + project levels A–F + section gate in `AGENTS.md`.
- Point OpenSpec `context` at that section.
- Keep density: checklists and tables, not a second guide.

**Non-Goals:**

- Rewriting user-facing pages in this change.
- Prose tooling; OpenSpec capability for doc style.
- A BA / non-coder product (trace→scenario UI, etc.).

## Decisions

1. **Home: `## Documentation` in `AGENTS.md`.** Not a new file; user `docs/` stays for library users.

2. **Project levels (ask “what project?”, not “what API?”):**

   | Level | Project shape | First need | Doc entry |
   | ----- | ------------- | ---------- | --------- |
   | **A** | Small app, widget, prototype; rare races | Small bus (`on`/`emit`) | README bus only |
   | **B** | SPA with async UI (search, submit, leave page) | Bus + policies | README → one `latest`; then `policies` |
   | **C** | Unreliable network / long flows | Selective effects (`retry`/`timeout`/…) | One effect per job; full list = reference |
   | **D** | Domain logic off the UI (testable without React) | Commands / jobs / modules | `actions` + modules example |
   | **E** | Existing Redux / Zustand / MobX | Integration recipe | `stores.md` |
   | **F** | Long-lived platform needs | Trace, HMR, semantics, entry map | Reference only |

   Simple bus → mostly **A** (and the base of every level). Policies → **B+**, not A.

3. **Section gate (for AI and authors).** Before adding a block, answer:
   - Which project level is this page for?
   - Does this block help that reader take the **next step**, or is it a **catalog** (all entries, all effects, all `ctx` fields, full Docs row)?
   - If we remove it, can level-A/B still install and run their scenario? If yes, keep it off this page (link to reference).

4. **Onboarding vs reference.** README + guide = ladder A→B→(C)→D. Package maps, full effect lists, Entries tables = reference (`docs/…` or later in the guide), never mid-README onboarding. One example per job per level; prefer a link up the ladder over a second example.

5. **Domain off UI vs BA.** Level **D** is for developers: handlers on the bus, UI only emits/listens. Docs may show examples without a UI framework. **Non-goal:** writing docs for business analysts; BA tooling (human-readable scenarios from traces, etc.) is a later product idea, not a doc principle.

6. **JavaScript-first.** Snippets omit event maps/generics when inference is enough; types when the page teaches typing or inference fails. `examples/*.ts` stay TypeScript for `pnpm tsgo`.

7. **Original principles stay:** low barrier, practice-first, simple→complex, minimal sufficiency, minimal examples, low cognitive load; README = benefit + install + quick start; details in `docs/`; no duplication.

8. **`openspec/config.yaml`:** one pointer sentence; full rules only in `AGENTS.md`.

9. **`skip_specs: true`.**

## Risks / Trade-offs

- **[Existing pages diverge from the bar]** → Follow-up rewrite; this change only records rules.
- **[A–F table feels like product marketing]** → Keep it as author guidance inside AGENTS, not a user-facing “choose your adventure” site.
- **[BA non-goal may feel dismissive]** → State it once; domain-off-UI for developers remains first-class (D).

## Migration Plan

1. Land `AGENTS.md` + `config.yaml` pointer.
2. Apply the gate on every new doc edit.
3. Optional later: trim README Entries / align pages to A–F.
