# The Creative Leadership Team Profile

If `.opencode/MACHINE.md` exists in this repo, read it fully before starting work. It is machine-local (gitignored, never pushed, present only on this machine).

This repository contains the fixed-order questionnaire frontend and the Cloudflare Worker/D1 data portal.

## Authority

- `authoritative-materials/` contains the approved V5 workbook and Word documents.
- `questions.csv` is the website-ready extraction of the 57 authoritative questions.
- Run `node tools/build-questions.mjs` after changing `questions.csv`.
- Generated files: `questions.js`, `question-sets/clt-current.json`, `worker/src/questions.json`, and `worker/src/question-sets.json`.

## Non-negotiable behaviour

- Product name: **The Creative Leadership Team Profile**.
- Questions are never randomised. They appear in the approved order within four sections.
- Roles are Team Leader (`oak`), Team Member (`maple`), and Team Observer (`cedar`).
- Section 1 has five frequency responses.
- Sections 2 and 3 add “Not enough opportunity to observe”.
- Section 4 adds “Never considered”.
- Special responses are stored by their distinct label and are not treated as numeric evidence by downstream analysis.
- The website collects, validates, stores, exports, and displays factual response data. "Analysis" in this context means *interpretation* — drawing conclusions, scoring, or recommending. Presenting factual, data-driven summaries of the raw answers (e.g. how many people chose each option, the most/least common answer, which answers were recorded as "Not enough opportunity to observe") is allowed because it simply restates the recorded data. The website must not go further and interpret what the answers mean or judge the team.
- Leader, member, and observer responses remain visibly separate in the data portal.
- Question sets are snapshotted when an assessment is created; an existing assessment never changes midstream.

## Verification

Run `node tools/build-questions.mjs`, `node --check app.js`, and `cd worker && npm run check`.
