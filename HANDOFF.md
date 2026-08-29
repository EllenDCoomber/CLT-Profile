# HANDOFF — CLT Profile (for the client's Cloudflare/ChatGPT agent)

This repo holds **CLT Profile**: a static survey frontend (GitHub Pages) plus a
Cloudflare Worker backend under `worker/` whose code and configuration are already
production-ready and committed. Read the repo to understand structure and current
state before changing anything — the visual design, page behaviour, and deploy
config are all already in place.

## What the client can do

The client can only relay prompts to you — they don't run commands or access
Cloudflare directly. So anything that needs doing on the Cloudflare side (login,
deploy, secrets) is yours to handle, and the only handshake back to the client is
the portal passcode.

## Deploy

Work out from `worker/` (config, migrations, README runbook, `config.js`) how to
deploy this into the client's Cloudflare account and connect it to the survey
frontend. The worker config and survey wiring are already set up; treat the
existing values (D1 binding, allowlist, survey URL) as intentional rather than
recreating them. The one thing that can't live in the repo is a Cloudflare secret
for the portal passcode (`ADMIN_KEY`): generate one, set it as the Worker's secret,
and report it back to the client so they can log in.

## Intent behind the pages

The pages were recently rebuilt to give the client a self-serve way to run
assessments and manage the data. High-level intent of each page:

- **Dashboard (assessment list):** an at-a-glance overview of every assessment (a
  company+team engagement). Each card should tell the client, without opening it,
  what the assessment is (company/team and any round label), which question set it
  uses and how many questions, when it was created, when the last response came in,
  and the response counts (total plus leader/member split). It should also let them
  copy either survey link, so a link can be resent if a respondent lost it. Avoid
  exposing meaningless internal id noise.

- **Report (single assessment):** the full read of one team's answers. It should
  always show the two survey links (leader and member) so a link can be recovered,
  and include a per-submission review list.

- **Submissions review:** the client needs to check each individual questionnaire
  for quality — specifically to spot a "bad actor" who answered the same value to
  every question and would skew the aggregated team results. So each submission
  should open as an accordion showing that person's answers clearly, one row per
  question, with the question in one column and a compact "mini dots" strip in
  another — mirroring the main report's scale (Almost never → Almost always, plus
  N/A) so a single column can be scanned and a uniform or erratic pattern is
  immediately obvious. Provide a per-submission delete so a bad submission can be
  removed and every chart/count updates accordingly.

The actual CSS, markup, and page logic for all of the above are already built and
committed in `worker/assets/index.html` (and `worker/src/index.ts` for the
backend). Preserve and align with the existing visual design rather than
reinventing it.
