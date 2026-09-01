# Creative Leadership Baseline View — Cloudflare Worker

The Worker stores questionnaire submissions in D1 and serves a passcode-protected data portal. The portal deliberately reports raw, factual response data only; interpretation is performed separately using the Creative Leadership skill.

## Roles and links

Each assessment creates three questionnaire links:

- Team Leader: `?t=oak&a=<assessment-id>`
- Team Member: `?t=maple&a=<assessment-id>`
- Team Observer: `?t=cedar&a=<assessment-id>`

The related environment variables are `ROLE_LEADER_TOKEN`, `ROLE_MEMBER_TOKEN`, and `ROLE_OBSERVER_TOKEN` in `wrangler.jsonc`.

## Main routes

- `POST /api/submit?t=<role-token>` validates and stores a 57-answer submission.
- `POST /api/assessments?key=<ADMIN_KEY>` creates and snapshots an assessment.
- `GET /api/assessments?key=<ADMIN_KEY>` lists assessments, three-role counts, and links.
- `GET /api/questions/<assessment-id>` returns the snapshotted fixed-order question set.
- `GET /api/data?key=<ADMIN_KEY>&assessment=<id>` returns raw JSON; add `&format=csv` for labelled CSV.
- `GET /` serves the data portal.

## Update and deploy

From the repository root run `node tools/build-questions.mjs`. From `worker/`, run `npm run check` and then `npx wrangler deploy`.

The D1 database is already configured in `wrangler.jsonc`. Existing assessments keep their original snapshotted questions; create a new assessment to test a new question set.
