# AGENTS.md

Instructions for coding agents working in this repository. Scope: the entire
repository tree. Read `README.md` for human-facing product and usage
documentation; keep this file focused on agent workflow and project constraints.

## Project Summary

Slowo Analyzer is a local static web app for analyzing strategies in Polish
Wordle. It has no backend.

- Stack: Vite, React 19, TypeScript in strict mode, Vitest with jsdom.
- Ranking and heavier scoring work runs in a Web Worker.
- Dictionary data is served from local public assets and cached in IndexedDB.
- Settings, theme, and game state are stored in localStorage.
- Production builds register a PWA service worker.

## Commands

Typical setup and development:

```bash
npm install
npm run dev
```

Validation and production checks:

```bash
npm test
npm run build
```

Useful targeted commands:

```bash
npm test -- src/test/wordle.test.ts
npm run dictionary:build
npm run preview
```

- `npm run dev` starts Vite on `0.0.0.0`; the default local URL is
  `http://localhost:5173`.
- Prefer focused tests for the touched path first, then run the full
  `npm test` when code changes are complete.
- Run `npm run build` after TypeScript, worker, Vite, PWA, or user-visible UI
  changes.
- Do not run `npm run dictionary:build` for ordinary code or documentation
  work. It downloads external sources and rewrites dictionary artifacts.

## Repository Layout

- `src/app/` - top-level React app state, routing/tabs, and shell wiring.
- `src/components/` - reusable UI components for the board, rankings,
  candidates, summaries, and dialogs.
- `src/domain/` - Wordle rules, scoring, solver, ranking, dictionary loading,
  and opening-move logic.
- `src/workers/` - analysis worker and client bridge for ranking work.
- `src/storage/` - IndexedDB dictionary cache and persisted game/theme state.
- `src/test/` - Vitest unit and component tests.
- `public/` - static dictionary files, precomputed opening moves, manifest, and
  service worker.
- `scripts/` - dictionary generation and related script tests.

## Implementation Rules

- Keep changes focused and local; do not perform unrelated refactors.
- Preserve strict TypeScript and the existing module style.
- Match the current code style: double quotes, semicolons, named imports, and
  small pure helpers in domain code.
- Do not add dependencies, package managers, formatters, linters, or build tools
  without explicit approval.
- Keep expensive ranking/scoring work off the main UI thread. Use or extend the
  existing Web Worker flow rather than moving heavy loops into React components.
- Keep React state updates predictable and avoid broad app-level rewrites when a
  localized component or domain helper change is enough.
- Add comments only when they clarify non-obvious domain or performance logic.

## Domain Rules

- Preserve Polish word handling: use `toLocaleLowerCase("pl-PL")`, NFC
  normalization, and `localeCompare(..., "pl")` where ordering or
  normalization must match dictionary behavior.
- Wordle scoring must correctly handle repeated letters in guesses and answers.
  Add or update tests when touching scoring or filtering.
- Keep the distinction between allowed guesses and possible answers. Do not
  collapse the separate dictionary mode unless the task explicitly requires it.
- Candidate filtering, entropy, average bucket, worst bucket, and hit
  probability should remain deterministic.
- User-visible Polish copy should stay concise and consistent with existing UI
  wording.

## Dictionary, Cache, and PWA Rules

- Treat `public/slowa.txt`, `public/hasla.txt`, and
  `public/opening-moves.json` as generated dictionary artifacts unless the task
  explicitly targets dictionary data.
- If dictionary inputs or generated outputs change, check whether
  `DICTIONARY_VERSION` in `src/domain/dictionaryMetadata.ts` also needs to
  change.
- If service worker cache behavior or cached public assets change, check
  `public/sw.js`, especially `CACHE_NAME`, `APP_SHELL`, and
  `VERSIONED_APP_SHELL_PATHS`.
- Preserve cache-busting behavior for dictionary refreshes.
- Do not commit browser caches, build output, local environment files, or other
  generated temporary artifacts.

## Testing Expectations

- Scoring, pattern conversion, and candidate filtering changes need focused
  tests in `src/test/wordle.test.ts` or the relevant domain test.
- Dictionary parsing, validation, cache, metadata, and generated-data changes
  need dictionary-focused tests.
- Ranking, fast scoring, solver, and opening-move changes need the matching
  domain tests and should preserve deterministic ordering.
- React component or app-flow changes need component/app tests with jsdom.
- After code changes, run at least `npm test` when feasible.
- After TypeScript, build configuration, worker, PWA, or UI changes, also run
  `npm run build`.
- If a check cannot be run, report the exact command and reason.

## Git and Documentation

- The working tree may be dirty. Never revert unrelated user changes.
- Stage selectively if asked to commit.
- Do not use destructive git commands such as `git reset --hard`.
- Do not amend commits or rewrite history unless explicitly asked.
- Update `README.md` only when install, run, dictionary, or user-facing behavior
  changes.
- Keep commit messages short and factual when asked to commit, for example
  `docs: add agent instructions`.
