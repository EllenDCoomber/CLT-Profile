# CLT Profile — Cloudflare Worker + D1 backend

The survey frontend (GitHub Pages) posts answers to this Worker, which stores them in a
Cloudflare **D1** database. The Worker also serves the passcode-protected **results portal**
the client uses to view per-assessment reports.

## What each route does

| Route | Purpose |
| --- | --- |
| `POST /api/submit?t=<role-token>` | Validates a submission against its assessment's snapshotted questions and stores it in D1. `t` must match the role token (`oak` leader, `maple` member). |
| `POST /api/assessments?key=<ADMIN_KEY>` | Creates an assessment (company + team name + question set), snapshots the set's questions, returns the two shareable survey links. |
| `GET /api/assessments?key=<ADMIN_KEY>` | Lists assessments with response counts (for the portal dashboard). |
| `GET /api/questionsets?key=<ADMIN_KEY>` | Lists available question sets (for the "New assessment" form). |
| `GET /api/questions/<assessment-id>` | Returns the assessment's snapshotted questions (used by the survey frontend when a link carries `?a=`). |
| `GET /api/data?key=<ADMIN_KEY>&assessment=<id>` | Returns one assessment's answers as JSON. Add `&format=csv` for CSV. |
| `GET /questions.json` | Current question definitions (kept in sync by the generator). |
| `GET /` | The results portal: passcode login (`ADMIN_KEY`) → assessment dashboard → per-assessment report (dot-strips, findings, CSV/JSON export) + "New assessment" form. |

## Files

- `src/index.ts` — the Worker itself.
- `src/questions.json` — current question definitions, **generated** from `../questions.csv` by `../tools/build-questions.mjs`. Do not hand-edit.
- `src/question-sets.json` — **generated** registry of every `../question-sets/*.json` file. Do not hand-edit; rerun the generator after adding/changing a set.
- `assets/index.html` — the results portal (static SPA).
- `migrations/0001_init.sql`, `migrations/0002_assessments.sql`, `migrations/0003_assessment_label.sql` — D1 schema.
- `wrangler.jsonc` — Worker config. The D1 `database_id` placeholder must be filled in at deploy time.

## Question sets & assessments

- **Question sets** live in `../question-sets/<slug>.json` (see `../question-sets/EXAMPLE.json` for the schema). To add or change one: drop a validated JSON in that folder, run `node tools/build-questions.mjs` (validates it and rebuilds `src/question-sets.json`), then `npx wrangler deploy`.
- **Assessments** are created in the portal ("New assessment"): company + team name + an optional label (e.g. "Baseline", "Round 2") + a question set. The chosen set's questions are **snapshotted into D1** at creation, so a question-set change never affects an assessment that already started. Each assessment gets a unique auto-generated id (slug + random suffix) — re-assessing the same company/team later creates a new assessment with its own id; the label is how you tell rounds apart.
- Survey links look like `https://<survey-url>/?t=oak&a=<assessment-id>` and `?t=maple&a=<assessment-id>`; the portal prints them when you create an assessment.

## Deploy runbook (executable by an AI agent)

This runbook is written to be run **by an AI agent on the client's behalf**. Every step
is a concrete command with the expected output to check for. There is exactly **one step
that needs the human client**: the Cloudflare login in step 1 — pause there and ask the
client to complete it.

### Prerequisites (verify before starting)

- Node.js 18+ and git installed (`node -v`, `git --version`).
- The repo cloned locally, and this folder (`worker/`) as the working directory.
- `npm install` has been run in `worker/` (a `node_modules/` folder exists).
- The client has a Cloudflare account and can log in when the browser opens.

All commands below run **from the `worker/` folder**.

### Step 0 — Install dependencies (one-time)

```sh
npm install
```

Expected: ends with `found 0 vulnerabilities`. If it fails, retry once, then stop and
report the error.

### Step 1 — Log in to the client's Cloudflare account (REQUIRES THE CLIENT)

```sh
npx wrangler login
```

This opens a browser window. **Pause and ask the client to log in with their Cloudflare
credentials and click "Allow".** Do not proceed until the terminal prints
`Successfully logged in.` If the environment has no browser (headless), use:

```sh
npx wrangler login --browser=false
```

...which prints a URL — send it to the client, and when they paste back a code, enter it.

### Step 2 — Create the database

```sh
npx wrangler d1 create clt-profile
```

Expected output contains a line like `database_id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"`.
Capture that UUID. If it says the database already exists, you can use the existing id
(`npx wrangler d1 list`).

Edit `wrangler.jsonc` and replace the placeholder `REPLACE_WITH_D1_DATABASE_ID` with that
UUID (keep the quotes). Do not change anything else.

### Step 3 — Apply the schema

```sh
npx wrangler d1 migrations apply clt-profile --remote
```

Expected: prints `0001_init.sql ✅`, `0002_assessments.sql ✅`,
`0003_assessment_label.sql ✅`. If it prompts "continue? yes/no", answer `yes`.

### Step 4 — Set the results passcode

Choose a strong passcode (e.g. from `openssl rand -hex 12` or any random string) — this
is what the client types on the portal login page. Store it somewhere safe, then:

```sh
echo "THE_PASSCODE" | npx wrangler secret put ADMIN_KEY
```

Expected: `Successfully created secret 'ADMIN_KEY'`. Keep a copy of the passcode — you'll
need it to verify and to give the client.

### Step 5 — Confirm the survey origin allowlist

Check `wrangler.jsonc` — the `ALLOWED_ORIGIN` value must be the survey's exact origin
(e.g. `https://ellendcoomber.github.io`). If the survey lives somewhere else, update it.

### Step 6 — Deploy

```sh
npx wrangler deploy
```

Expected output contains `Uploaded clt-profile` and `https://clt-profile.<account-subdomain>.workers.dev`.
Save that URL — it's the portal address. If the domain is already taken, wrangler will
report it; rename the Worker in `wrangler.jsonc` (`"name": ...`) and retry.

### Step 7 — Verify the deployed Worker

```sh
curl -s -o /dev/null -w "%{http_code}" https://clt-profile.<account-subdomain>.workers.dev/api/assessments?key=wrong
```

Expected: `401` (proves the portal + auth are live). Then:

```sh
curl -s https://clt-profile.<account-subdomain>.workers.dev/ | head -c 200
```

Expected: HTML containing `Results portal`.

### Step 8 — Connect the survey frontend

Edit `config.js` at the repo root and set:

```js
workerUrl: 'https://clt-profile.<account-subdomain>.workers.dev',
```

Commit and push. The live survey now stores answers in the client's Cloudflare database.
(The "View results portal (admin)" link on the launcher derives from `workerUrl`
automatically — there is no separate `adminUrl` setting.)

### Step 9 — Smoke-test with seeded data

```sh
node scripts/seed-test-data.mjs \
  --url https://clt-profile.<account-subdomain>.workers.dev \
  --admin-key THE_PASSCODE \
  --teams 2 --leaders 2
```

Expected: creates 2 assessments and submits responses. Then open the portal URL in a
browser, log in with the passcode, and confirm the assessments and their reports appear.
When done testing, clear it:

```sh
npx wrangler d1 execute clt-profile --remote --command "DELETE FROM responses; DELETE FROM assessments;"
```

### Handover

Give the client:
- Portal URL: `https://clt-profile.<account-subdomain>.workers.dev/`
- The passcode set in step 4.

Tell them the portal is where they create assessments and view reports; each "New
assessment" prints the two survey links to share with the team.

## Optional: custom domain

To serve results from a domain the client owns (e.g. `results.<clientdomain>.com`),
add it under Cloudflare → the Worker → Settings → Domains & Routes, and update
`ALLOWED_ORIGIN` if the survey itself moves.

## Testing locally

With `.dev.vars.example` copied to `.dev.vars` (set `ADMIN_KEY`), run:

```sh
npx wrangler d1 migrations apply clt-profile --local
npx wrangler dev
```

Then in another terminal, create an assessment first (a submission needs a valid one):

```sh
curl -X POST "http://localhost:8787/api/assessments?key=YOUR_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"company":"Acme","teamName":"Leadership","questionSetId":"clt-current"}'
```

Note the returned `id`, then submit a response against it:

```sh
curl -X POST "http://localhost:8787/api/submit?t=oak" \
  -H "Content-Type: application/json" \
  -d '{"role":"leader","assessment":"<id>","company":"Acme","department":"Brand","answers":[]}'
```

Open `http://localhost:8787/` and enter the `ADMIN_KEY` from `.dev.vars` to see the
portal, create an assessment, and open its report.

## Loading & clearing test data

The seed script generates realistic test responses and submits them through the real
API (assessment creation + `/api/submit`), so it exercises the full pipeline. Data
matches the design mockups (same seeded generator) and company names are prefixed
`TEST –` so it's easy to spot.

**Load test data (local dev):**

```sh
node scripts/seed-test-data.mjs --url http://localhost:8787 --admin-key test-passcode-123
```

**Load test data (remote / deployed):**

```sh
node scripts/seed-test-data.mjs \
  --url https://clt-profile.<account-subdomain>.workers.dev \
  --admin-key <ADMIN_KEY>
```

**Options:**

| Flag | Default | What it does |
| --- | --- | --- |
| `--teams N` | `2` | How many assessments (teams) to create. |
| `--members N` | `7` | Members per team. |
| `--leaders N` | `1` | Leaders per team (tests the multi-leader report rows). |
| `--scenarios` | `on` | Injects patterns so every "what stands out" card shows data (leader–team gap, widest spread, mostly-not-observed, pressure shift) on the first team. Use `--scenarios false` for pure mockup-parity data. |
| `--tag X` | `TEST` | Prefix on company names so test rows are identifiable. |
| `--label A,B` | (empty) | Optional per-team labels (e.g. `Baseline,Round 2`) to simulate re-assessments of the same team. |
| `--admin-key X` | (empty) | Required for remote; local dev can pass the `.dev.vars` value. |

**Clear all test data** (drops every response and assessment — use before/after a test
run; this also wipes any real data, so only run it while testing):

```sh
# local
npx wrangler d1 execute clt-profile --local --command "DELETE FROM responses; DELETE FROM assessments;"
# remote
npx wrangler d1 execute clt-profile --remote --command "DELETE FROM responses; DELETE FROM assessments;"
```
