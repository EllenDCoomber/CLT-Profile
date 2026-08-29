import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';

const LEADER_LEAD = [
  'The Creative Leadership Team Profile shows how this leadership team currently creates results and how that experience changes under pressure.',
  'It provides a baseline for strengthening how the team works together and delivers against its strategic priorities, and for understanding the impact of that work over time.'
];

const LEADER_ABOUT = [
  'Your responses are confidential. Expanding Possibilities will be able to identify your responses as the team leader\u2019s, but your individual answers will not be shared with anyone else or reported to the team.',
  'Knowing which responses are yours allows us to compare how you experience the team with how the team collectively experiences itself. This can help us identify important differences in perspective and use them to inform the work with the team.',
  'The responses from the other members of the leadership team remain anonymous and are combined to create an overall team picture.'
];

const MEMBER_ABOUT = [
  'Your responses are anonymous. Nobody in the team, your leader, or Expanding Possibilities will see your individual answers. Your responses are combined with those of the other members of your leadership team to create an overall picture of the team.'
];

const INSTRUCTIONS = {
  leader: [
    'The first five questions are about you in your role as a leader. The remaining questions ask about your experience of the leadership team as a whole.',
    'There are no right or wrong answers and this is not a ranking. We are simply looking for an honest picture of how you and the team currently operate.',
    'Please respond with the answer that feels most accurate, without overthinking it. Answer based on what actually happens, rather than what you think should happen or what you would ideally like to be true.'
  ],
  member: [
    'The first five questions are about you in your role as a team member. The remaining questions ask about your experience of the leadership team as a whole.',
    'There are no right or wrong answers and this is not a ranking. We are simply looking for an honest picture of how you and the team currently operate.',
    'Please respond with the answer that feels most accurate, without overthinking it. Answer based on what actually happens, rather than what you think should happen or what you would ideally like to be true.'
  ]
};

const SCALE_INTRO = 'For each statement, choose the response that best reflects how frequently it has been true in practice over approximately the last three months:';
const NEO_NOTE = 'If you have not had enough opportunity to observe the behaviour described, please select \u201cN/A\u201d rather than choosing a frequency.';
const TIMING = '15\u201320 minutes';

const PERSONAL_SCALE = ['Almost never', 'Rarely', 'About half the time', 'Often', 'Almost always'];
const TEAM_SCALE = [...PERSONAL_SCALE, 'N/A'];

const PERSONAL = [
  { id: 'P1', text: 'I have felt clear about our company\u2019s mission, vision and strategy.' },
  { id: 'P2', text: 'I have felt inspired by what we are here to create.' },
  { id: 'P3', text: 'I have felt valued as a member of this leadership team.' },
  { id: 'P4', text: 'I have been clear about what success looks like for us.' },
  { id: 'P5', text: 'I have felt that we are winning as a team.' }
];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field.trim());
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      if (field.length > 0 || row.length > 0) {
        row.push(field.trim());
        rows.push(row);
      }
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    rows.push(row);
  }
  return rows;
}

const source = readFileSync(new URL('../questions.csv', import.meta.url), 'utf8');
const rows = parseCsv(source);
const header = rows[0];
const findIndex = (name) => header.indexOf(name);

const col = {
  ref: findIndex('S-reference'),
  context: findIndex('Context'),
  principle: findIndex('Primary Principle'),
  premise: findIndex('High Level Premise'),
  subPremise: findIndex('Sub-premise'),
  behaviour: findIndex('Behaviour'),
  text: findIndex('Final Question'),
  matched: findIndex('Matched Q')
};

const team = rows.slice(1).filter((r) => r[col.ref]).map((r) => ({
  id: r[col.ref],
  ref: r[col.ref],
  context: r[col.context] || 'Baseline',
  principle: r[col.principle] || '',
  premise: r[col.premise] || '',
  subPremise: r[col.subPremise] || '',
  behaviour: r[col.behaviour] || '',
  matched: r[col.matched] || null,
  text: r[col.text]
}));

const data = {
  title: 'The Creative Leadership Team Profile',
  intro: {
    leader: {
      heading: 'The Creative Leadership Team Profile \u2013 Team Leader',
      lead: LEADER_LEAD,
      aboutHeading: 'About your answers',
      about: LEADER_ABOUT,
      instructionsHeading: 'Instructions',
      instructions: INSTRUCTIONS.leader,
      scaleIntro: SCALE_INTRO,
      neoNote: NEO_NOTE,
      timing: TIMING,
      thanks: 'Thank you.',
      sign: 'Ellen'
    },
    member: {
      heading: 'The Creative Leadership Team Profile',
      lead: LEADER_LEAD,
      aboutHeading: 'About your answers',
      about: MEMBER_ABOUT,
      instructionsHeading: 'Instructions',
      instructions: INSTRUCTIONS.member,
      scaleIntro: SCALE_INTRO,
      neoNote: NEO_NOTE,
      timing: TIMING,
      thanks: 'Thank you.',
      sign: 'Ellen'
    }
  },
  beforeBeginHeading: 'Before you begin',
  personalScale: PERSONAL_SCALE,
  teamScale: TEAM_SCALE,
  personal: PERSONAL,
  team
};

let out = 'window.CLT_QUESTIONS = ' + JSON.stringify(data, null, 2) + ';\n';
writeFileSync(new URL('../questions.js', import.meta.url), out, 'utf8');

const workerData = {
  title: data.title,
  personalScale: data.personalScale,
  teamScale: data.teamScale,
  personal: data.personal,
  team: data.team
};
writeFileSync(new URL('../worker/src/questions.json', import.meta.url), JSON.stringify(workerData, null, 2) + '\n', 'utf8');

const chunks = [];
for (let i = 0; i < team.length; i += 11) chunks.push(team.slice(i, i + 11).map((q) => q.id).join(','));
console.log(`wrote questions.js and worker/src/questions.json`);
console.log(`personal: ${PERSONAL.length}`);
console.log(`team: ${team.length} (${chunks.length} screens of 11: ${chunks.length === 5 ? 'ok' : 'not 5!'})`);
const pressure = team.filter((q) => q.context === 'Pressure Shift').length;
console.log(`pressure shift: ${pressure}`);
const matched = team.filter((q) => q.matched).length;
console.log(`with matched baseline: ${matched}`);

// ---- question sets (repo files) + worker registry ----
const setsDir = new URL('../question-sets/', import.meta.url);
mkdirSync(setsDir, { recursive: true });

const SCREEN_SIZE = 11;

function validateSet(slug, set) {
  const errs = [];
  if (!set || typeof set !== 'object') errs.push('not an object');
  if (!set.title || typeof set.title !== 'string') errs.push('missing string "title"');
  if (!Array.isArray(set.personalScale) || set.personalScale.length !== 5) errs.push('personalScale must be a 5-item array');
  if (!Array.isArray(set.teamScale) || set.teamScale.length !== 6) errs.push('teamScale must be a 6-item array');
  if (!Array.isArray(set.personal) || set.personal.length !== 5) errs.push('personal must have exactly 5 questions');
  if (!Array.isArray(set.team) || set.team.length === 0 || set.team.length % SCREEN_SIZE !== 0) {
    errs.push(`team must contain a multiple of ${SCREEN_SIZE} statements`);
  } else {
    const screens = set.team.length / SCREEN_SIZE;
    if (screens < 1) errs.push('team needs at least one screen');
    const ids = new Set();
    set.team.forEach((t, i) => {
      if (!t || typeof t.id !== 'string' || !t.text) errs.push(`team[${i}] needs id + text`);
      if (t && t.id) {
        if (ids.has(t.id)) errs.push(`duplicate team id ${t.id}`);
        ids.add(t.id);
      }
    });
  }
  if (errs.length) throw new Error(`question set "${slug}":\n  - ${errs.join('\n  - ')}`);
}

// Write the canonical current set (from questions.csv + hardcoded intros).
writeFileSync(
  new URL('clt-current.json', setsDir),
  JSON.stringify(data, null, 2) + '\n',
  'utf8'
);

// Build the registry from every other question-set file, skipping the example.
const registry = {};
for (const entry of readdirSync(setsDir).sort()) {
  if (!entry.endsWith('.json')) continue;
  const slug = entry.slice(0, -5);
  if (slug === 'EXAMPLE') continue;
  let set;
  try {
    set = JSON.parse(readFileSync(new URL(entry, setsDir), 'utf8'));
  } catch (err) {
    throw new Error(`question set "${slug}": invalid JSON (${err.message})`);
  }
  validateSet(slug, set);
  registry[slug] = set;
  const screens = Math.ceil(set.team.length / SCREEN_SIZE);
  console.log(`question set "${slug}": ${set.personal.length} personal, ${set.team.length} team (${screens} screens of ${SCREEN_SIZE})`);
}
writeFileSync(
  new URL('../worker/src/question-sets.json', import.meta.url),
  JSON.stringify(registry, null, 2) + '\n',
  'utf8'
);
console.log(`wrote question-sets/clt-current.json and worker/src/question-sets.json (${Object.keys(registry).length} set(s) in registry)`);