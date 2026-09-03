import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const QUESTIONS_PATH = fileURLToPath(new URL('../src/questions.json', import.meta.url));
const questions = JSON.parse(readFileSync(QUESTIONS_PATH, 'utf8'));

const TEAM = questions.team;
const PERSONAL = questions.personal;
const SCALES = questions.scales;

const ARG = parseArgs();
const BASE_URL = (ARG.url || 'http://localhost:8787').replace(/\/+$/, '');
const ADMIN_KEY = ARG['admin-key'] || ARG.key || process.env.CLT_ADMIN_KEY || '';
const TAG = ARG.tag || 'TEST';
const TEAMS = Number(ARG.teams || 2);
const MEMBERS = Number(ARG.members || 7);
const LEADERS = Number(ARG.leaders || 1);
const OBSERVERS = Number(ARG.observers || 0);
const EXISTING_ASSESSMENT = ARG.assessment || '';
const LABELS = (ARG.label || '').split(',').map((s) => s.trim()).filter(Boolean);
const DO_SCENARIOS = ARG.scenarios === 'true' || ARG.scenarios === '1' || ARG.scenarios === 'yes' || !ARG.scenarios ? true : ARG.scenarios === 'false' || ARG.scenarios === '0' || ARG.scenarios === 'no' ? false : true;

function parseArgs() {
  const out = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const name = a.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      out[name] = next;
      i++;
    } else {
      out[name] = 'true';
    }
  }
  return out;
}

/* ---- deterministic generator, identical to mockups (seed 42) ---- */
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickIn(rng, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) return i;
  }
  return weights.length - 1;
}

function buildAnswers(rng, role) {
  const a = {};
  PERSONAL.forEach((p) => {
    const w = role === 'leader' ? [1, 2, 4, 6, 4] : [1, 3, 4, 5, 3];
    a[p.id] = pickIn(rng, w) + 1;
  });
  TEAM.forEach((t) => {
    let base = t.context === 'Pressure Shift' ? [2, 3, 4, 3, 2] : [1, 2, 3, 4, 3];
    if (t.principle === 'Synergy' || t.principle === 'Self') base = [1, 2, 3, 4, 3];
    let v = pickIn(rng, base) + 1;
    if (rng() < (t.context === 'Pressure Shift' ? 0.1 : 0.04)) v = 6;
    a[t.id] = v;
  });
  return a;
}

/* ---- scenario injections so every finding card shows data ---- */
const SCENARIOS = {
  // leader strongly disagrees while the team mostly agrees -> leader-team gap
  leaderGap: (answers, teamId) => {
    const idx = TEAM.findIndex((t) => t.id === teamId);
    if (idx === -1) return;
    answers[teamId] = 1;
  },
  // give members a spread across all 5 options -> widest spread
  widestSpread: (answersList, teamId) => {
    const spread = [1, 2, 3, 4, 5];
    answersList.forEach((a, i) => { a[teamId] = spread[i % 5]; });
  },
  // most members N/A -> mostly "not observed"
  mostlyNA: (answersList, teamId) => {
    answersList.forEach((a) => { a[teamId] = 6; });
  },
  // shift answers on a pressure pair vs its baseline -> changed under pressure
  pressureShift: (answersList, pair) => {
    answersList.forEach((a) => {
      if (a[pair.baseline] !== 6) a[pair.pressure] = Math.max(1, a[pair.baseline] - 2);
    });
  }
};

function applyScenarios(teamAnswers, rng) {
  const pressurePairs = TEAM.filter((t) => t.matched).map((t) => ({ baseline: t.matched, pressure: t.id }));
  const pick = (list) => list[Math.floor(rng() * list.length)];

  const gapId = pick(TEAM).id;
  SCENARIOS.leaderGap(teamAnswers.leaders[0], gapId);

  const spreadId = pick(TEAM.filter((t) => t.id !== gapId)).id;
  SCENARIOS.widestSpread(teamAnswers.members, spreadId);

  const naId = pick(TEAM.filter((t) => t.id !== gapId && t.id !== spreadId)).id;
  SCENARIOS.mostlyNA(teamAnswers.members, naId);

  if (pressurePairs.length) {
    const pair = pick(pressurePairs);
    SCENARIOS.pressureShift(teamAnswers.members, pair);
  }
}

/* ---- payload helpers ---- */
function answerRecord(item, value) {
  const scale = item.section === 1
    ? SCALES.frequency
    : item.section === 4
      ? SCALES.considered
      : SCALES.observed;
  return {
    id: item.id,
    ref: item.ref || null,
    context: item.context || null,
    principle: item.principle || null,
    matched: item.matched || null,
    value,
    label: scale[value - 1]
  };
}

function buildPayload(role, assessment, company, department, answers) {
  return {
    role,
    assessment,
    company,
    department,
    submittedAt: new Date().toISOString(),
    answers: [
      ...PERSONAL.map((p) => answerRecord(p, answers[p.id])),
      ...TEAM.map((t) => answerRecord(t, answers[t.id]))
    ]
  };
}

/* ---- API ---- */
async function api(path, opts = {}) {
  const res = await fetch(BASE_URL + path, opts);
  let data = null;
  try { data = await res.json(); } catch (e) { /* no body */ }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${path}: ${data && data.error ? data.error : JSON.stringify(data) || ''}`);
  }
  return data;
}

async function createAssessment(company, teamName, label) {
  return api('/api/assessments?key=' + encodeURIComponent(ADMIN_KEY), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ company, teamName, questionSetId: 'clt-current', label: label || undefined })
  });
}

async function submit(role, token, payload) {
  return api('/api/submit?t=' + encodeURIComponent(token), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

/* ---- main ---- */
async function main() {
  console.log(`Seeding test data -> ${BASE_URL}`);
  console.log(`  teams=${TEAMS} members/team=${MEMBERS} leaders/team=${LEADERS} supporters/team=${OBSERVERS} scenarios=${DO_SCENARIOS} tag="${TAG}"`);
  if (!ADMIN_KEY) console.log('  (no ADMIN_KEY given; assessment creation may fail if required)');

  const teams = [
    'Acme Marketing', 'Beta Ltd', 'Gamma & Co', 'Delta Studios',
    'Epsilon Health', 'Zeta Finance', 'Eta Logistics', 'Theta Retail'
  ];

  let created = 0;
  for (let t = 0; t < TEAMS; t++) {
    const company = `${TAG} – ${teams[t % teams.length]}`;
    const teamName = t === 0 ? 'Leadership Team' : `Team ${['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf'][t % 7]}`;

    console.log(`\n[${t + 1}/${TEAMS}] ${company} / ${teamName}`);
    const assessment = EXISTING_ASSESSMENT
      ? {
          id: EXISTING_ASSESSMENT,
          links: {
            leader: `${BASE_URL}/?t=oak&a=${encodeURIComponent(EXISTING_ASSESSMENT)}`,
            member: `${BASE_URL}/?t=maple&a=${encodeURIComponent(EXISTING_ASSESSMENT)}`,
            observer: `${BASE_URL}/?t=cedar&a=${encodeURIComponent(EXISTING_ASSESSMENT)}`
          }
        }
      : await createAssessment(company, teamName, LABELS[t] || null);
    if (!EXISTING_ASSESSMENT) created++;

    const rng = mulberry32(42 + t);
    const teamAnswers = {
      leaders: Array.from({ length: LEADERS }, () => buildAnswers(rng, 'leader')),
      members: Array.from({ length: MEMBERS }, () => buildAnswers(rng, 'member')),
      observers: Array.from({ length: OBSERVERS }, () => buildAnswers(rng, 'observer'))
    };
    if (DO_SCENARIOS && t === 0) applyScenarios(teamAnswers, rng);

    let submitted = 0;
    for (let li = 0; li < LEADERS; li++) {
      const payload = buildPayload('leader', assessment.id, company, teamName + (LEADERS > 1 ? ' · Leader ' + (li + 1) : ''), teamAnswers.leaders[li]);
      await submit('leader', 'oak', payload);
      submitted++;
    }
    for (let mi = 0; mi < MEMBERS; mi++) {
      const dept = ['Marketing', 'Brand', 'Comms', 'Creative', 'Digital', 'Strategy', 'Operations', 'Finance'][mi % 8];
      const payload = buildPayload('member', assessment.id, company, dept, teamAnswers.members[mi]);
      await submit('member', 'maple', payload);
      submitted++;
    }
    for (let oi = 0; oi < OBSERVERS; oi++) {
      const payload = buildPayload('observer', assessment.id, company, `Supporter ${oi + 1}`, teamAnswers.observers[oi]);
      await submit('observer', 'cedar', payload);
      submitted++;
    }

    console.log(`  submitted ${submitted} responses`);
    console.log(`  leader link: ${assessment.links.leader}`);
    console.log(`  member link: ${assessment.links.member}`);
    console.log(`  supporter link: ${assessment.links.observer}`);
  }

  console.log(`\nDone. Created ${created} assessment(s). Open ${BASE_URL}/ to view.`);
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
