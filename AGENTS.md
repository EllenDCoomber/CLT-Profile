# AGENTS.md

## Overview

Static, dependency-free survey app for GitHub Pages. No build step, no package.json, no bundler — files are opened/produced directly via `file://` or Pages.

- Role is chosen by URL param: bare `index.html` shows a launcher; `?t=oak` = leader version, `?t=maple` = member version. Tokens are defined in `config.js`; unknown tokens show a "not recognised" screen.
- Answers are NOT collected anywhere yet: `config.js` → `workerUrl` is empty, so submit shows a "development version" thank-you (progress lives only in browser `localStorage`). A Cloudflare Worker + D1 backend is planned, not built.
- Sources for the leader/member intro text are `Team Leader Version.txt` and `Team Member Version.txt`.

## Generated file — do not hand-edit `questions.js`

`questions.js` is generated from `questions.csv` by `tools/build-questions.mjs` (Node built-ins only, no deps). To change questions/answers, edit the CSV (or the generator's hardcoded intros) then run:

```
node tools/build-questions.mjs
```

Direct edits to `questions.js` will be overwritten on the next run. Each team statement carries `ref` (S1–S55), `context` (Baseline/Pressure Shift), `principle`, `matched`, etc. — used behind the scenes for analysis, never displayed to respondents.

## Script load order & globals

`index.html` loads `config.js` → `questions.js` → `app.js` in that order. `app.js` reads `window.CLT_CONFIG` and `window.CLT_QUESTIONS` (plain globals, no modules). Keep that order.

## Behavior an agent will otherwise get wrong

- The 55 team statements are **shuffled per session** (Fisher–Yates) and the order is persisted in `localStorage` so a reload keeps the same order. "Start over — clear my answers" on the intro reshuffles.
- Respondents see **no question numbers**; numbering was deliberately removed.
- Scales: personal questions have 5 options (no N/A); team statements have 6 with **"N/A"** = value 6 (value is 1-based index; the label is recorded alongside).
- The N/A instruction note renders above the statements on team screens.
- `localStorage` keys are `clt_profile_leader` / `clt_profile_member`; stored shape is `{ screen, answers, company, department, order }`. Cleared on submit/start-over.
- `questionsPerScreen` (11) lives in `config.js`; screens are intro → 5 personal → 55 team in screens of 11 → submit.

## Future worker contract

If/when the backend is built, `app.js:submit()` already POSTs this shape to `${workerUrl}/api/submit` (currently skipped when `workerUrl` is empty):

```
{ role, company, department, submittedAt,
  answers: [{ id, ref, context, principle, matched, value, label }] }
```

## Verification

No automated tests or lint/typecheck setup exists in the repo. Verify by opening `index.html` (launcher) or `index.html?t=oak` / `?t=maple` in a browser — it runs from `file://`, no server needed. Use `node --check app.js` for a JS syntax pass.