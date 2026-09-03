import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';

function parseCsv(text) {
  const rows = []; let row = []; let field = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      if (field || row.length) { row.push(field); rows.push(row); }
      row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const rows = parseCsv(readFileSync(new URL('../questions.csv', import.meta.url), 'utf8'));
const header = rows.shift();
const at = (name) => header.indexOf(name);
const items = rows.filter((r) => r[at('Reference')]).map((r) => ({
  id: r[at('Reference')], ref: r[at('Reference')], section: Number(r[at('Section')]),
  sectionTitle: r[at('Section Title')], context: r[at('Reporting Treatment')] || null,
  principle: r[at('Primary Principle')] || null, premise: r[at('High Level Premise')] || null,
  subPremise: r[at('Sub-premise')] || null, behaviour: r[at('Behaviour')] || null,
  matched: r[at('Matched Q')] || null, text: r[at('Final Question')]
}));

if (items.length !== 59) throw new Error(`Expected 59 fixed-order questions, found ${items.length}`);
for (let i = 1; i <= 4; i++) if (!items.some((q) => q.section === i)) throw new Error(`Missing Section ${i}`);

const PRODUCT = 'The Creative Leadership Team Profile';
const VERSION = 'V6';
const COMMON_LEAD = [
  PRODUCT + ' shows how this leadership team currently creates results and how that changes under pressure.',
  'It is a snapshot in time that allows the engagement to be designed around the specific needs, dynamics and priorities of this leadership team. It provides a baseline for strengthening how the team works together and delivers against its strategic priorities.',
  'There will be a follow-up view approximately 90 days after the offsite, enabling the team to see what’s shifted, where progress has been made and where it wants to focus next.'
];
const COMMON_INSTRUCTIONS = [
  'Please consider the questions carefully and answer as honestly and candidly as possible, answering based on what actually happens, rather than what you think should happen or what you would ideally like to be true.',
  'There is no perfect team. We are simply looking for an honest picture of how you and the team currently operate.',
  'There are 59 questions across 4 sections. Please allow 45–60 mins to complete.'
];
const intros = {
  member: { version: 'TEAM MEMBER VERSION', heading: PRODUCT, lead: COMMON_LEAD, about: [
    'Your responses are anonymous. Your name is not associated with your answers, so neither your team, your leader nor Expanding Possibilities can identify who gave any individual response.',
    'Your responses are combined with those of the other members of your leadership team to create an overall picture of how the team currently operates.'
  ], instructions: COMMON_INSTRUCTIONS },
  leader: { version: 'TEAM LEADER VERSION', heading: PRODUCT, lead: COMMON_LEAD, about: [
    'Your responses are confidential. Expanding Possibilities will be able to identify your responses as the team leader’s, but your individual answers will not be shared with anyone else or reported to the team.',
    'Knowing which responses are yours allows us to compare how you experience the team with how the team collectively experiences itself. This can help us identify important differences in perspective and use them to inform the work with the team.',
    'The responses from the other members of the leadership team remain anonymous and are combined to create an overall team picture.'
  ], instructions: COMMON_INSTRUCTIONS },
  observer: { version: 'TEAM SUPPORTER VERSION', heading: PRODUCT, lead: COMMON_LEAD, about: [
    'Your responses are anonymous. Your name is not associated with your answers, so neither your team, your leader nor Expanding Possibilities can identify who gave any individual response.'
  ], instructions: COMMON_INSTRUCTIONS }
};
const scales = {
  frequency: ['Almost never', 'Rarely', 'About half the time', 'Often', 'Almost always'],
  observed: ['Almost never', 'Rarely', 'About half the time', 'Often', 'Almost always', 'Not enough opportunity to observe'],
  considered: ['Almost never', 'Rarely', 'About half the time', 'Often', 'Almost always', 'Never considered']
};
const sections = [
  { id: 1, title: 'Your experience as a leader', scale: 'frequency', instructions: 'These questions are about your experience as a leader in this team. Thinking about approximately the last three months, choose the response that best reflects how frequently each statement has been true for you.' },
  { id: 2, title: 'Structures for Success', prefix: 'As a team…', scale: 'observed', instructions: 'These questions ask about your experience of the leadership team over the last three months. Please choose the response that best reflects how frequently you have observed the following. If, after taking time to consider, you feel that you haven’t had the opportunity to observe the behavior described please select ‘Not enough opportunity to observe’.' },
  { id: 3, title: 'Team Dynamics for Effective Creation', prefix: 'As a team…', scale: 'observed', instructions: 'These questions ask about your experience of the leadership team over the last three months. Please choose the response that best reflects how frequently you have observed the following. If, after taking time to consider, you feel that you haven’t had the opportunity to observe the behavior described please select ‘Not enough opportunity to observe’.' },
  { id: 4, title: 'Impact and Contribution', scale: 'considered', instructions: 'These questions ask about your impact and contribution to the team over the last three months. There may be some concepts here you have not considered before. If, after taking time to reflect, you are unsure please check the ‘never considered’ option.' }
];
const data = { title: PRODUCT, version: VERSION, beforeBeginHeading: 'Before you begin', timing: '45–60 mins', intros, scales, sections,
  personal: items.filter((q) => q.section === 1), team: items.filter((q) => q.section !== 1) };

writeFileSync(new URL('../questions.js', import.meta.url), 'window.CLT_QUESTIONS = ' + JSON.stringify(data, null, 2) + ';\n');
writeFileSync(new URL('../worker/src/questions.json', import.meta.url), JSON.stringify(data, null, 2) + '\n');
const setsDir = new URL('../question-sets/', import.meta.url);
mkdirSync(setsDir, { recursive: true });
writeFileSync(new URL('clt-current.json', setsDir), JSON.stringify(data, null, 2) + '\n');
const registry = {};
for (const entry of readdirSync(setsDir).sort()) {
  if (!entry.endsWith('.json') || entry === 'EXAMPLE.json') continue;
  const slug = entry.slice(0, -5);
  const set = JSON.parse(readFileSync(new URL(entry, setsDir), 'utf8'));
  const all = [...(set.personal || []), ...(set.team || [])];
  if (!set.title || set.version !== VERSION || !set.intros || !set.scales || !Array.isArray(set.sections) || all.length !== 59 || new Set(all.map((q) => q.id)).size !== 59) throw new Error(`${slug}: invalid V6 question set`);
  registry[slug] = set;
}
writeFileSync(new URL('../worker/src/question-sets.json', import.meta.url), JSON.stringify(registry, null, 2) + '\n');
console.log(`Wrote fixed V6 set: ${items.length} questions across ${sections.length} sections; ${Object.keys(registry).length} registered set(s).`);
