import questions from './questions.json';
import questionSets from './question-sets.json';

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  ROLE_LEADER_TOKEN: string;
  ROLE_MEMBER_TOKEN: string;
  ALLOWED_ORIGIN: string;
  ADMIN_KEY: string;
  SURVEY_BASE: string;
}

interface AnswerRecord {
  id: string;
  ref: string | null;
  context: string | null;
  principle: string | null;
  matched: string | null;
  value: number | null;
  label: string;
}

interface Submission {
  role: string;
  assessment: string;
  company: string;
  department: string;
  submittedAt: string;
  answers: AnswerRecord[];
}

interface AssessmentRow {
  id: string;
  company: string;
  team_name: string;
  question_set_id: string;
  questions: string;
  label: string | null;
  created_at: string;
}

const MAX_BODY = 1024 * 1024;

type QuestionSet = typeof questionSets[string];

function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra }
  });
}

function corsHeaders(env: Env): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin'
  };
}

function submitJson(env: Env, data: unknown, status: number): Response {
  return json(data, status, corsHeaders(env));
}

function timingSafeEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'team';
}

// Strong random suffix: 8 base36 chars from crypto.getRandomValues
// (~2.8e12 combos) so ids can never collide, regardless of human-entered text.
function randomIdSuffix(len = 8): string {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let out = '';
  for (let i = 0; i < len; i++) out += chars[bytes[i] % 36];
  return out;
}

function assessmentId(company: string, teamName: string): string {
  return `${slugify(company)}-${slugify(teamName)}-${randomIdSuffix()}`;
}

function validateSubmission(body: unknown): Submission {
  if (!body || typeof body !== 'object') throw new Error('invalid body');
  const b = body as Record<string, unknown>;

  const role = b.role;
  if (role !== 'leader' && role !== 'member') throw new Error('invalid role');

  const assessment = typeof b.assessment === 'string' ? b.assessment.trim() : '';
  if (!assessment) throw new Error('assessment required');

  const company = typeof b.company === 'string' ? b.company.trim() : '';
  const department = typeof b.department === 'string' ? b.department.trim() : '';

  if (!Array.isArray(b.answers)) throw new Error('answers required');

  const answers = b.answers.map((a, i) => {
    if (!a || typeof a !== 'object') throw new Error('bad answer at ' + i);
    const rec = a as Record<string, unknown>;
    const value = typeof rec.value === 'number' ? rec.value : null;
    if (value === null || value < 1 || value > 6) throw new Error('bad value at ' + i);
    return {
      id: typeof rec.id === 'string' ? rec.id : '',
      ref: typeof rec.ref === 'string' ? rec.ref : null,
      context: typeof rec.context === 'string' ? rec.context : null,
      principle: typeof rec.principle === 'string' ? rec.principle : null,
      matched: typeof rec.matched === 'string' ? rec.matched : null,
      value,
      label: typeof rec.label === 'string' ? rec.label : ''
    } as AnswerRecord;
  });

  return {
    role,
    assessment,
    company,
    department,
    submittedAt: typeof b.submittedAt === 'string' ? b.submittedAt : new Date().toISOString(),
    answers
  };
}

async function getAssessment(env: Env, id: string): Promise<AssessmentRow | null> {
  const { results } = await env.DB.prepare('SELECT id, company, team_name, question_set_id, questions, label, created_at FROM assessments WHERE id = ?')
    .bind(id)
    .all();
  return results.length ? (results[0] as AssessmentRow) : null;
}

function expectedAnswerCount(set: QuestionSet): number {
  return set.personal.length + set.team.length;
}

async function handleSubmit(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(env) });
  }
  if (request.method !== 'POST') {
    return submitJson(env, { error: 'method not allowed' }, 405);
  }

  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > MAX_BODY) return submitJson(env, { error: 'request too large' }, 413);

  let submission: Submission;
  try {
    submission = validateSubmission(await request.json());
  } catch (err) {
    return submitJson(env, { error: err instanceof Error ? err.message : 'invalid submission' }, 400);
  }

  const assessment = await getAssessment(env, submission.assessment);
  if (!assessment) return submitJson(env, { error: 'unknown assessment' }, 404);

  const set = JSON.parse(assessment.questions) as QuestionSet;
  const expected = expectedAnswerCount(set);
  if (submission.answers.length !== expected) {
    return submitJson(env, { error: 'expected ' + expected + ' answers' }, 400);
  }

  const token = new URL(request.url).searchParams.get('t') || '';
  const valid =
    (submission.role === 'leader' && timingSafeEqual(token, env.ROLE_LEADER_TOKEN)) ||
    (submission.role === 'member' && timingSafeEqual(token, env.ROLE_MEMBER_TOKEN));
  if (!valid) return submitJson(env, { error: 'invalid role token' }, 403);

  const id = crypto.randomUUID();
  await env.DB.prepare(
    'INSERT INTO responses (id, role, company, department, answers, created_at, assessment) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(id, submission.role, assessment.company, assessment.team_name, JSON.stringify(submission.answers), submission.submittedAt, submission.assessment)
    .run();

  return submitJson(env, { ok: true, id }, 201);
}

async function loadResponses(env: Env, assessmentId: string) {
  const { results } = await env.DB.prepare(
    'SELECT id, role, company, department, answers, created_at FROM responses WHERE assessment = ? ORDER BY created_at ASC'
  )
    .bind(assessmentId)
    .all();
  return results.map((r) => ({
    id: r.id,
    role: r.role,
    company: r.company,
    department: r.department,
    answers: JSON.parse(r.answers),
    submittedAt: r.created_at
  }));
}

function toCsv(rows: unknown[], set: QuestionSet): string {
  const header = ['role', 'company', 'department', 'submittedAt'];
  const questionIds = [
    ...set.personal.map((p) => p.id),
    ...set.team.map((t) => t.id)
  ];
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [header.concat(questionIds).join(',')];
  for (const row of rows) {
    const r = row as { role: string; company: string; department: string; submittedAt: string; answers: AnswerRecord[] };
    const byId: Record<string, number | null> = {};
    for (const a of r.answers) byId[a.id] = a.value;
    lines.push([
      esc(r.role), esc(r.company), esc(r.department), esc(r.submittedAt)
    ].concat(questionIds.map((id) => byId[id] != null ? String(byId[id]) : '')).join(','));
  }
  return lines.join('\n');
}

function requireAdmin(request: Request, env: Env): boolean {
  const key = new URL(request.url).searchParams.get('key') || '';
  return !!(env.ADMIN_KEY && timingSafeEqual(key, env.ADMIN_KEY));
}

async function handleCreateAssessment(request: Request, env: Env): Promise<Response> {
  if (!requireAdmin(request, env)) return json({ error: 'unauthorized' }, 401);
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  let body: { company?: unknown; teamName?: unknown; questionSetId?: unknown; label?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid body' }, 400);
  }

  const company = typeof body.company === 'string' ? body.company.trim() : '';
  const teamName = typeof body.teamName === 'string' ? body.teamName.trim() : '';
  const questionSetId = typeof body.questionSetId === 'string' ? body.questionSetId.trim() : '';
  const label = typeof body.label === 'string' ? body.label.trim() : '';
  if (!company || !teamName) return json({ error: 'company and team name required' }, 400);

  const set = questionSets[questionSetId];
  if (!set) return json({ error: 'unknown question set: ' + questionSetId }, 400);

  const id = assessmentId(company, teamName);
  const now = new Date().toISOString();
  await env.DB.prepare(
    'INSERT INTO assessments (id, company, team_name, question_set_id, questions, label, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(id, company, teamName, questionSetId, JSON.stringify(set), label || null, now)
    .run();

  return json({
    ok: true,
    id,
    company,
    teamName,
    questionSetId,
    label: label || null,
    created_at: now,
    links: {
      leader: env.SURVEY_BASE + '?t=' + env.ROLE_LEADER_TOKEN + '&a=' + encodeURIComponent(id),
      member: env.SURVEY_BASE + '?t=' + env.ROLE_MEMBER_TOKEN + '&a=' + encodeURIComponent(id)
    }
  }, 201);
}

async function handleListAssessments(request: Request, env: Env): Promise<Response> {
  if (!requireAdmin(request, env)) return json({ error: 'unauthorized' }, 401);

  const { results } = await env.DB.prepare(
    `SELECT a.id, a.company, a.team_name, a.question_set_id, a.label, a.created_at,
            (SELECT COUNT(*) FROM responses r WHERE r.assessment = a.id AND r.role = 'leader') AS leaders,
            (SELECT COUNT(*) FROM responses r WHERE r.assessment = a.id AND r.role = 'member') AS members,
            (SELECT MAX(r.created_at) FROM responses r WHERE r.assessment = a.id) AS last_at
     FROM assessments a ORDER BY a.created_at DESC`
  ).all();

  return json(results.map((r) => {
    const set = questionSets[r.question_set_id as keyof typeof questionSets];
    return {
      id: r.id,
      company: r.company,
      teamName: r.team_name,
      questionSetId: r.question_set_id,
      questionSetTitle: set ? set.title : r.question_set_id,
      questionCount: set ? set.personal.length + set.team.length : 0,
      label: r.label || null,
      created_at: r.created_at,
      lastResponseAt: r.last_at || null,
      leaderCount: Number(r.leaders || 0),
      memberCount: Number(r.members || 0),
      links: {
        leader: env.SURVEY_BASE + '?t=' + env.ROLE_LEADER_TOKEN + '&a=' + encodeURIComponent(r.id),
        member: env.SURVEY_BASE + '?t=' + env.ROLE_MEMBER_TOKEN + '&a=' + encodeURIComponent(r.id)
      }
    };
  }));
}

async function handleListQuestionSets(request: Request, env: Env): Promise<Response> {
  if (!requireAdmin(request, env)) return json({ error: 'unauthorized' }, 401);
  return json(Object.entries(questionSets).map(([id, set]) => ({
    id,
    title: set.title,
    personalCount: set.personal.length,
    teamCount: set.team.length
  })));
}

async function handleAssessmentQuestions(request: Request, env: Env, assessmentId: string): Promise<Response> {
  const assessment = await getAssessment(env, assessmentId);
  if (!assessment) return json({ error: 'unknown assessment' }, 404);
  return json(JSON.parse(assessment.questions));
}

async function handleData(request: Request, env: Env): Promise<Response> {
  if (!requireAdmin(request, env)) return json({ error: 'unauthorized' }, 401);

  const url = new URL(request.url);
  const assessmentId = url.searchParams.get('assessment') || '';
  const format = url.searchParams.get('format') || 'json';
  if (!assessmentId) return json({ error: 'assessment required' }, 400);

  const assessment = await getAssessment(env, assessmentId);
  if (!assessment) return json({ error: 'unknown assessment' }, 404);
  const set = JSON.parse(assessment.questions) as QuestionSet;

  const rows = await loadResponses(env, assessmentId);
  if (format === 'csv') {
    return new Response(toCsv(rows, set), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="clt-results.csv"'
      }
    });
  }
  return json(rows);
}

async function handleDeleteAssessment(request: Request, env: Env, assessmentId: string): Promise<Response> {
  if (!requireAdmin(request, env)) return json({ error: 'unauthorized' }, 401);

  const assessment = await getAssessment(env, assessmentId);
  if (!assessment) return json({ error: 'unknown assessment' }, 404);

  await env.DB.prepare('DELETE FROM responses WHERE assessment = ?').bind(assessmentId).run();
  await env.DB.prepare('DELETE FROM assessments WHERE id = ?').bind(assessmentId).run();

  return json({ ok: true });
}

async function handleDeleteResponse(request: Request, env: Env, responseId: string): Promise<Response> {
  if (!requireAdmin(request, env)) return json({ error: 'unauthorized' }, 401);

  const result = await env.DB.prepare('SELECT id FROM responses WHERE id = ?')
    .bind(responseId)
    .first();
  if (!result) return json({ error: 'unknown response' }, 404);

  await env.DB.prepare('DELETE FROM responses WHERE id = ?').bind(responseId).run();

  return json({ ok: true });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/api/submit') {
      return handleSubmit(request, env);
    }

    if (path === '/api/assessments' && request.method === 'POST') {
      return handleCreateAssessment(request, env);
    }

    if (path === '/api/assessments') {
      return handleListAssessments(request, env);
    }

    const assessmentDeleteMatch = path.match(/^\/api\/assessments\/([^/]+)$/);
    if (assessmentDeleteMatch && request.method === 'DELETE') {
      return handleDeleteAssessment(request, env, decodeURIComponent(assessmentDeleteMatch[1]));
    }

    const responseDeleteMatch = path.match(/^\/api\/responses\/([^/]+)$/);
    if (responseDeleteMatch && request.method === 'DELETE') {
      return handleDeleteResponse(request, env, decodeURIComponent(responseDeleteMatch[1]));
    }

    if (path === '/api/questionsets') {
      return handleListQuestionSets(request, env);
    }

    const questionsMatch = path.match(/^\/api\/questions\/([^/]+)$/);
    if (questionsMatch) {
      return handleAssessmentQuestions(request, env, decodeURIComponent(questionsMatch[1]));
    }

    if (path === '/api/data') {
      return handleData(request, env);
    }

    if (path === '/questions.json') {
      return json(questions, 200);
    }

    if (path === '/') {
      const index = await env.ASSETS.fetch(new URL('/', request.url).toString());
      const html = await index.text();
      return new Response(html, {
        status: index.status,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store'
        }
      });
    }

    return new Response('Not found', { status: 404 });
  }
};
