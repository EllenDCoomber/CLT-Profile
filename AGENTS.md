# AGENTS.md

## Overview

Static, dependency-free survey app for GitHub Pages. No build step, no package.json, no bundler — files are opened/produced directly via `file://` or Pages.

- Role is chosen by URL param: bare `index.html` shows a launcher; `?t=oak` = leader version, `?t=maple` = member version. Tokens are defined in `config.js`; unknown tokens show a "not recognised" screen.
- Backend: a Cloudflare Worker + D1 lives in `worker/` (see `worker/README.md` for the deploy runbook). `config.js` → `workerUrl` is **empty until deployed**; while empty, submit shows a "development version" thank-you and nothing is stored.
- Sources for the leader/member intro text are `Team Leader Version.txt` and `Team Member Version.txt`.

## Generated files — do not hand-edit

`questions.js`, `worker/src/questions.json`, `question-sets/clt-current.json`, and `worker/src/question-sets.json` are all generated from `questions.csv` (and the generator's hardcoded intros) by `tools/build-questions.mjs` (Node built-ins only, no deps). To change the canonical questions/answers, edit the CSV (or the generator's hardcoded intros) then run:

```
node tools/build-questions.mjs
```

Direct edits to any generated file are overwritten on the next run. The generator also validates every file in `question-sets/` and builds the Worker registry `worker/src/question-sets.json` from them. Each team statement carries `ref` (S1–S55), `context` (Baseline/Pressure Shift), `principle`, `matched`, etc. — used behind the scenes for analysis, never displayed to respondents.

## Question sets & assessments

- A **question set** is a full questionnaire payload file in `question-sets/<slug>.json` (schema documented in `question-sets/EXAMPLE.json`; see `clt-current.json` for a complete example). Sets can differ entirely — they are not just edits.
- To add/change a set: put a validated JSON file in `question-sets/` (e.g. `clt-v2.json`), run `node tools/build-questions.mjs` (validates it + rebuilds the registry), commit/push, then `cd worker && npx wrangler deploy`.
- An **assessment** is one team engagement (company + team name + optional label + a question set). It is created in the results portal ("New assessment" form) and snapshots the chosen set's questions into D1 at creation. **Questions cannot change mid-assessment** — a rewrite only applies to assessments created after it. Each assessment has a **unique auto-generated id** (slug + 8-char random suffix); re-assessing the same company/team later creates a new assessment with its own id, and the optional label (e.g. "Baseline", "Round 2") is how rounds are told apart. The id is the grouping key — human-entered text never affects identity.
- Survey links carry both role and assessment: `?t=oak&a=<assessment-id>` / `?t=maple&a=<assessment-id>`. When `?a=` is present, `app.js` fetches that assessment's snapshotted questions from the Worker instead of the bundled `questions.js`. Bare `?t=` links (no `?a=`) still work and use the bundled questions.
- `localStorage` keys are `clt_profile_<role>` or `clt_profile_<role>_<assessment>`; stored shape is `{ screen, answers, company, department, order }`. Cleared on submit/start-over.
- Multiple leaders per assessment are supported: the report shows one labelled marker row per leader.

## Script load order & globals

`index.html` loads `config.js` → `questions.js` → `app.js` in that order. `app.js` reads `window.CLT_CONFIG` and `window.CLT_QUESTIONS` (plain globals, no modules). Keep that order. Boot is async when `?a=` is set (fetches the assessment's questions from the Worker).

## Behavior an agent will otherwise get wrong

- The team statements are **shuffled per session** (Fisher–Yates) and the order is persisted in `localStorage` so a reload keeps the same order. "Start over — clear my answers" on the intro clears the store and navigates back to the bare page (launcher).
- Respondents see **no question numbers**; numbering was deliberately removed.
- Scales: personal questions have 5 options (no N/A); team statements have 6 with **"N/A"** = value 6 (value is 1-based index; the label is recorded alongside).
- The N/A instruction note renders above the statements on team screens.
- `questionsPerScreen` (11) lives in `config.js`; screens are intro → personal → team in screens of 11 → submit.

## Worker contract

`app.js:submit()` POSTs this shape to `${workerUrl}/api/submit?t=<role-token>`:

```
{ role, assessment, company, department, submittedAt,
  answers: [{ id, ref, context, principle, matched, value, label }] }
```

The Worker (`worker/src/index.ts`) validates the token against `ROLE_LEADER_TOKEN`/`ROLE_MEMBER_TOKEN` and the answer count against the assessment's snapshotted questions, stores in D1, and serves the passcode-gated results portal at `/` (`ADMIN_KEY`) with an assessment dashboard, per-assessment reports, CSV/JSON export, and the "New assessment" form. Admin API routes (`/api/assessments`, `/api/questionsets`, `/api/data`) require `?key=<ADMIN_KEY>`. See `worker/README.md` for routes and the deploy runbook.

## Test data (seed & clear)

To exercise the full Cloudflare integration you need realistic test data. Use the seed script (it creates assessments and submits responses through the real API, matching the design mockups' data; company names are prefixed `TEST –`):

```sh
# local dev
node worker/scripts/seed-test-data.mjs --url http://localhost:8787 --admin-key test-passcode-123

# remote (deployed worker)
node worker/scripts/seed-test-data.mjs --url https://clt-profile.<subdomain>.workers.dev --admin-key <ADMIN_KEY>
```

Key flags: `--teams N` (assessments), `--members N` (per team), `--leaders N` (tests multi-leader rows), `--label A,B` (labels to simulate re-assessments of the same team), `--scenarios false` (pure mockup-parity data; scenarios inject patterns so every "what stands out" card shows). Full table in `worker/README.md`.

To clear test data (drops all responses + assessments — only run while testing, it wipes everything):

```sh
npx wrangler d1 execute clt-profile --local --command "DELETE FROM responses; DELETE FROM assessments;"   # local
npx wrangler d1 execute clt-profile --remote --command "DELETE FROM responses; DELETE FROM assessments;"  # remote
```

## Verification

No automated tests or lint/typecheck setup exists in the repo. Verify by opening `index.html` (launcher) or `index.html?t=oak` / `?t=maple` in a browser — it runs from `file://`, no server needed. Use `node --check app.js` for a JS syntax pass.