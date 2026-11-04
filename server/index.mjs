// HSSE platform as one Cloudflare Worker: static site (assets binding), staff API, admin portal, external ERP/HRM API, D1 database.
//   bindings (wrangler.jsonc): DB (D1), ASSETS (site/), LIMITER (rate limit). Secret: ADMIN_TOKEN (24+ characters, bootstrap admin).
// Files in site/ are served before this code runs; only /, /api/*, /admin and unknown paths reach fetch() below.
// Put /admin behind Cloudflare Access when deployed publicly: it lists employee records.
// API contract for ERP/HRM integrators: see docs/API.md (OpenAPI: server/openapi.json).
import adminHtml from './admin.html';
import lessons from '../site/lessons.json';

const modules = new Set(lessons.modules.map((m) => m.id));
const moduleTrack = new Map(lessons.modules.map((m) => [m.id, m.track ?? 'ride']));
const stepIds = new Map(lessons.modules.map((m) => [m.id, new Set(m.steps.map((s) => s.id))]));
const langs = new Set(Object.keys(lessons.langs ?? { sw: 1, en: 1 }));
const sha = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');
const same = (a, b) => a.length === b.length && [...a].reduce((x, c, i) => x | (c.charCodeAt(0) ^ b.charCodeAt(i)), 0) === 0;
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => ALPHABET[b % ALPHABET.length]).join('');
const randHex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');
const fail = (status, message) => Object.assign(new Error(message), { status });
const str = (v, max, required = false) => {
  const s = typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
  if (required && !s) throw fail(400, 'a required text field is empty');
  if (s.length > max) throw fail(400, `text longer than ${max} characters`);
  return s || null;
};
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)) && new Date(d).toISOString().startsWith(d);
const moduleId = (v) => { if (!modules.has(v)) throw fail(400, 'unknown module'); return v; };
const countryOf = (v, fallback = null) => {
  if (v == null || v === '') return fallback;
  const c = String(v).trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) throw fail(400, 'country must be a 2-letter code, e.g. TZ, KE, UG, RW');
  return c;
};
const langOf = (v, fallback = null) => {
  if (v == null || v === '') return fallback;
  const l = String(v).trim().toLowerCase();
  if (!langs.has(l)) throw fail(400, `language must be one of: ${[...langs].join(', ')}`);
  return l;
};
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
async function body(req) {
  if (+(req.headers.get('content-length') ?? 0) > 1e6) throw fail(413, 'body too large');
  try { return JSON.parse((await req.text()) || '{}'); } catch { throw fail(400, 'invalid JSON'); }
}
const csv = (rows) => rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"`).join(',')).join('\r\n');
const page = (url) => {
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit') ?? 100) || 100));
  const offset = Math.max(0, Number(url.searchParams.get('offset') ?? 0) || 0);
  return { limit, offset };
};

// ---------- audit + webhooks ----------
async function audit(env, actor, action, entity = null, entityId = null, detail = null) {
  try { await env.DB.prepare('insert into audit_log(actor_type, actor, action, entity, entity_id, detail) values (?,?,?,?,?,?)')
    .bind(actor?.type ?? 'system', actor?.name ?? 'system', action, entity, entityId == null ? null : String(entityId), detail ? JSON.stringify(detail).slice(0, 2000) : null).run(); } catch (e) { console.error('audit failed', e); }
}
async function hmac(secret, text) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function webhookUrlOk(u) {
  try { const x = new URL(u); return x.protocol === 'https:' || (x.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(x.hostname)); } catch { return false; }
}
async function fireWebhooks(env, event, payload) {
  const { results } = await env.DB.prepare('select id, url, secret, events from webhook where active = 1').all().catch(() => ({ results: [] }));
  const text = JSON.stringify({ event, at: new Date().toISOString(), data: payload });
  for (const w of results) {
    const evts = String(w.events).split(',').map((s) => s.trim());
    if (!evts.includes(event) && !evts.includes('*')) continue;
    const { meta } = await env.DB.prepare('insert into webhook_delivery(webhook_id, event, payload) values (?,?,?)').bind(w.id, event, text).run();
    try {
      const r = await fetch(w.url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Endesha-Event': event, 'X-Endesha-Signature': `sha256=${await hmac(w.secret, text)}` }, body: text, signal: AbortSignal.timeout(5000) });
      await env.DB.prepare('update webhook_delivery set status = ?, response_code = ? where id = ?').bind(r.ok ? 'delivered' : 'failed', r.status, meta.last_row_id).run();
    } catch { await env.DB.prepare("update webhook_delivery set status = 'failed' where id = ?").bind(meta.last_row_id).run(); }
  }
}

// ---------- staff (learner phone) ----------
async function staff(req, env) {
  const { success } = await env.LIMITER.limit({ key: req.headers.get('cf-connecting-ip') ?? 'local' });
  if (!success) throw fail(429, 'too many requests, wait a minute');
  const code = (req.headers.get('x-staff-code') ?? '').toUpperCase().replace(/\s/g, '');
  const who = await env.DB.prepare('select id, name from employee where active = 1 and code_hash = ?').bind(await sha(code)).first();
  if (!who) throw fail(401, 'code not recognised');
  return who;
}

// ---------- people import / upsert (shared by admin + v1 API) ----------
async function importPeople(env, rows) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 500) throw fail(400, 'send 1 to 500 rows');
  const people = rows.map((r) => {
    r ??= {};
    const e = { name: str(r.name, 120, true), login: str(r.odoo_login, 120), email: str(r.email, 160), department: str(r.department, 80), site: str(r.site, 80), company: str(r.company, 80),
      country: countryOf(r.country), language: langOf(r.language), extSystem: str(r.external_system, 60), extId: str(r.external_id, 120) };
    e.id = r.odoo_employee_id === '' || r.odoo_employee_id == null ? null : Number(r.odoo_employee_id);
    if (e.id !== null && !Number.isInteger(e.id)) throw fail(400, `${e.name}: odoo_employee_id must be a whole number`);
    if (!!e.extSystem !== !!e.extId) throw fail(400, `${e.name}: external_system and external_id must be sent together`);
    if (!e.login && e.id === null && !e.extId) throw fail(400, `${e.name}: odoo_login, odoo_employee_id or external_id is required`);
    return e;
  });
  const keys = people.flatMap((e) => [e.login && `l:${e.login}`, e.id !== null && `i:${e.id}`, e.extId && `x:${e.extSystem}:${e.extId}`].filter(Boolean));
  if (new Set(keys).size !== keys.length) throw fail(400, 'the same login, employee ID or external ID is in two rows');
  // One lookup for the whole batch (not one query per row, which would hit D1
  // per-invocation query limits at 500 rows); matching then happens in memory.
  const logins = people.map((e) => e.login).filter(Boolean), odooIds = people.map((e) => e.id).filter((v) => v !== null);
  const exts = people.filter((e) => e.extId);
  const conds = [], binds = [];
  if (logins.length) { conds.push(`odoo_login in (${logins.map(() => '?').join(',')})`); binds.push(...logins); }
  if (odooIds.length) { conds.push(`odoo_employee_id in (${odooIds.map(() => '?').join(',')})`); binds.push(...odooIds); }
  if (exts.length) { conds.push(`(external_system, external_id) in (values ${exts.map(() => '(?,?)').join(',')})`); for (const e of exts) binds.push(e.extSystem, e.extId); }
  const existing = conds.length ? (await env.DB.prepare(`select id, odoo_login, odoo_employee_id, external_system, external_id from employee where ${conds.join(' or ')}`).bind(...binds).all()).results : [];
  const writes = [], out = [];
  for (const e of people) {
    const found = existing.filter((x) => (e.login && x.odoo_login === e.login) || (e.id !== null && x.odoo_employee_id === e.id) || (e.extId && x.external_system === e.extSystem && x.external_id === e.extId));
    if (found.length > 1) throw fail(409, `${e.name}: login, employee ID and external ID belong to different people`);
    if (found[0]) {
      writes.push(env.DB.prepare(`update employee set name = ?2, odoo_login = coalesce(?3, odoo_login), odoo_employee_id = coalesce(?4, odoo_employee_id),
        email = coalesce(?5, email), department = coalesce(?6, department), site = coalesce(?7, site), country = coalesce(?8, country), language = coalesce(?9, language),
        external_system = coalesce(?10, external_system), external_id = coalesce(?11, external_id), company = coalesce(?12, company) where id = ?1`)
        .bind(found[0].id, e.name, e.login, e.id, e.email, e.department, e.site, e.country, e.language, e.extSystem, e.extId, e.company));
      out.push({ id: found[0].id, name: e.name, created: false });
    } else {
      const code = newCode();
      writes.push(env.DB.prepare(`insert into employee(name, odoo_login, odoo_employee_id, email, department, site, country, language, external_system, external_id, company, code_hash)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) returning id`).bind(e.name, e.login, e.id, e.email, e.department, e.site, e.country ?? 'TZ', e.language ?? 'sw', e.extSystem, e.extId, e.company, await sha(code)));
      out.push({ id: null, name: e.name, created: true, code });
    }
  }
  const results = await env.DB.batch(writes);
  results.forEach((r, i) => { if (out[i].created) out[i].id = r.results[0].id; });
  return out;
}
const empShape = (p) => ({ id: p.id, name: p.name, odoo_login: p.odoo_login, odoo_employee_id: p.odoo_employee_id, external_system: p.external_system, external_id: p.external_id,
  email: p.email, department: p.department, site: p.site, company: p.company, country: p.country, language: p.language, active: !!p.active, created_at: p.created_at });

async function assignModules(env, b) {
  const ids = (b.employee_ids ?? []).map(Number).filter(Number.isInteger);
  // Refresher schedule: rider refresher repeats every 3 months, work HSSE every 6, unless HSSE set an interval.
  const months = b.refresh_months === undefined || b.refresh_months === '' ? (moduleTrack.get(b.module) === 'ride' ? 3 : 6) : Number(b.refresh_months);
  if (!ids.length || !Number.isInteger(months) || months < 1 || months > 60) throw fail(400, 'choose people and a refresh interval of 1 to 60 months');
  const due = b.due_date ? str(b.due_date, 10) : null;
  if (due && !isDate(due)) throw fail(400, 'due_date must be a real date, YYYY-MM-DD');
  const { meta } = await env.DB.prepare(`insert into assignment(employee_id, module, due_date, refresh_months)
    select id, ?2, ?3, ?4 from employee where id in (select value from json_each(?1))
    on conflict (employee_id, module) do update set due_date = excluded.due_date, refresh_months = excluded.refresh_months`)
    .bind(JSON.stringify(ids), moduleId(b.module), due, months).run();
  return meta.changes;
}
async function recordCompletion(env, employeeId, module, atIso, source) {
  const { meta } = await env.DB.prepare('insert or ignore into completion(employee_id, module, completed_at, source) values (?, ?, ?, ?)').bind(employeeId, moduleId(module), atIso, source).run();
  if (meta.changes) await fireWebhooks(env, 'completion.created', { employee_id: employeeId, module, completed_at: atIso, source });
  return meta.changes;
}
async function recordQuiz(env, employeeId, results, source) {
  if (!Array.isArray(results) || !results.length || results.length > 100) throw fail(400, 'send 1 to 100 quiz results');
  const writes = results.map((r) => {
    moduleId(r.module);
    if (!stepIds.get(r.module).has(r.step)) throw fail(400, `unknown step ${r.step} for module ${r.module}`);
    let at = new Date(r.at ?? r.answered_at ?? Date.now());
    if (Number.isNaN(+at) || +at > Date.now() + 864e5) at = new Date();
    return env.DB.prepare('insert or ignore into quiz_result(employee_id, module, step, correct, answered_at, source) values (?,?,?,?,?,?)')
      .bind(employeeId, r.module, r.step, r.correct ? 1 : 0, at.toISOString(), source);
  });
  const doneRows = await env.DB.batch(writes);
  return doneRows.reduce((n, r) => n + (r.meta?.changes ?? 0), 0); // retries of the same answer event are ignored
}
// ---------- automatic reminders + monthly scenario ----------
// Sending path: POST {to, subject, text} as JSON to EMAIL_WEBHOOK_URL (e.g. a Power Automate /
// Logic Apps HTTP trigger or any mail relay), with EMAIL_API_KEY as Bearer when set. With no
// provider configured nothing is sent, but every due reminder is still logged as 'no_provider'
// so HSSE can see exactly who was due. That is a configuration blocker, not missing code.
async function sendMail(env, mail) {
  if (!env.EMAIL_WEBHOOK_URL) return { status: 'no_provider', detail: 'EMAIL_WEBHOOK_URL is not configured' };
  try {
    const r = await fetch(env.EMAIL_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(env.EMAIL_API_KEY ? { Authorization: `Bearer ${env.EMAIL_API_KEY}` } : {}) },
      body: JSON.stringify(mail), signal: AbortSignal.timeout(8000) });
    return r.ok ? { status: 'sent', detail: `HTTP ${r.status}` } : { status: 'failed', detail: `HTTP ${r.status}` };
  } catch (e) { return { status: 'failed', detail: String(e.message ?? e).slice(0, 200) }; }
}
async function runReminders(env, { dryRun = false } = {}) {
  const { results: due } = await env.DB.prepare(`select e.id, e.name, e.email, s.module, s.status as kind, s.next_due, s.due_date
    from assignment_status s join employee e on e.id = s.employee_id
    where e.active = 1 and s.status in ('overdue', 'due_soon') order by e.name, s.module`).all();
  const out = [];
  for (const d of due) {
    const recent = await env.DB.prepare(`select 1 from reminder_log where employee_id = ? and module = ? and kind = ? and status = 'sent' and created_at > strftime('%Y-%m-%dT%H:%M:%fZ','now','-14 days') limit 1`).bind(d.id, d.module, d.kind).first();
    if (recent) { out.push({ ...d, result: 'skipped_recent' }); continue; }
    if (dryRun) { out.push({ ...d, result: d.email ? 'would_send' : 'no_email' }); continue; }
    const res = !d.email ? { status: 'no_email', detail: 'employee has no email address' }
      : await sendMail(env, { to: d.email, kind: 'reminder', employee_id: d.id, module: d.module,
          subject: `Salama refresher due: ${d.module}`, text: `Habari ${d.name}, your Salama safety refresher (${d.module}) is ${d.kind === 'overdue' ? 'overdue' : 'due soon'}${d.next_due ? ` (due ${String(d.next_due).slice(0, 10)})` : ''}. Please complete it or ask your supervisor for your personal link.` });
    await env.DB.prepare('insert into reminder_log(employee_id, module, kind, status, detail) values (?,?,?,?,?)').bind(d.id, d.module, d.kind, res.status, res.detail).run();
    out.push({ ...d, result: res.status });
  }
  return { total: out.length, sent: out.filter((x) => x.result === 'sent').length, items: out };
}
async function ensureScenario(env) {
  const month = new Date().toISOString().slice(0, 7);
  const existing = await env.DB.prepare('select month, module, step from monthly_scenario where month = ?').bind(month).first();
  if (existing) return existing;
  const missed = await env.DB.prepare(`select module, step from quiz_result where correct = 0 and step not in (select step from monthly_scenario) group by module, step order by count(*) desc limit 1`).first().catch(() => null);
  let pick = missed;
  if (!pick) {
    const used = new Set((await env.DB.prepare('select step from monthly_scenario').all()).results.map((r) => r.step));
    const all = lessons.modules.flatMap((m) => m.steps.filter((s) => s.answer).map((s) => ({ module: m.id, step: s.id })));
    const qs = all.filter((q) => !used.has(q.step)).length ? all.filter((q) => !used.has(q.step)) : all;
    const months = (new Date().getUTCFullYear() - 2026) * 12 + new Date().getUTCMonth();
    pick = qs[Math.abs(months) % qs.length];
  }
  await env.DB.prepare('insert or ignore into monthly_scenario(month, module, step) values (?,?,?)').bind(month, pick.module, pick.step).run();
  return { month, module: pick.module, step: pick.step };
}
async function distributeScenario(env) {
  const sc = await ensureScenario(env);
  const { results: people } = await env.DB.prepare('select id, name, email from employee where active = 1 and email is not null').all();
  let sent = 0, logged = 0;
  for (const person of people) {
    const already = await env.DB.prepare(`select 1 from reminder_log where employee_id = ? and kind = 'scenario' and detail like ? limit 1`).bind(person.id, `${sc.month}%`).first();
    if (already) continue;
    const res = await sendMail(env, { to: person.email, kind: 'scenario', employee_id: person.id, module: sc.module,
      subject: `Monthly safety scenario: ${sc.module}`, text: `Habari ${person.name}, this month's Salama safety scenario is from ${sc.module}. Open your Salama lessons, sign in with your code, and try it. Asante.` });
    await env.DB.prepare('insert into reminder_log(employee_id, module, kind, status, detail) values (?,?,?,?,?)').bind(person.id, sc.module, 'scenario', res.status, `${sc.month}: ${res.detail}`).run();
    logged++; if (res.status === 'sent') sent++;
  }
  return { scenario: sc, recipients: people.length, logged, sent };
}
// Muse draft generator (Meta Model API, OpenAI-compatible). HSSE reviews every
// draft; nothing AI-generated is published to learners automatically. Without a
// MODEL_API_KEY secret this returns 503 code 'no_meta_key' so the portal can say so.
async function draftScenario(env, b) {
  if (!env.MODEL_API_KEY) throw Object.assign(fail(503, 'Meta Model API key not configured (set the MODEL_API_KEY secret)'), { code: 'no_meta_key' });
  const mod = lessons.modules.find((m) => m.id === b.module) ?? lessons.modules.find((m) => m.track === 'work');
  const step = mod.steps.find((s) => s.id === b.step) ?? mod.steps.find((s) => s.answer);
  const prompt = `You write short safety-training quiz questions for East African workplace staff with low literacy. Module: ${mod.title.en}. Example question: "${step.text.en}" Write ONE new scenario multiple-choice question on the same topic, different situation. Simple English (one short sentence per option), plus a faithful Kiswahili translation of everything. Exactly 3 options, exactly one correct. Reply with only JSON: {"question_en":"","question_sw":"","options_en":["","",""],"options_sw":["","",""],"answer":0,"why_en":"","why_sw":""} where answer is the 0-based index of the correct option.`;
  const r = await fetch(`${env.MODEL_API_URL ?? 'https://api.meta.ai/v1'}/chat/completions`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.MODEL_API_KEY}` },
    body: JSON.stringify({ model: env.MODEL_API_MODEL ?? 'muse-spark-1.3', messages: [{ role: 'user', content: prompt }], temperature: 0.7 }),
    signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw fail(502, `Meta Model API returned HTTP ${r.status}`);
  const data = await r.json();
  let draft; try { draft = JSON.parse(String(data.choices?.[0]?.message?.content ?? '').replace(/^```json?|```$/gm, '').trim()); } catch { throw fail(502, 'Meta Model API did not return valid JSON'); }
  if (!draft.question_en || !Array.isArray(draft.options_en) || draft.options_en.length !== 3 || ![0, 1, 2].includes(draft.answer)) throw fail(502, 'Meta Model API returned an incomplete draft');
  return { module: mod.id, based_on: step.id, model: env.MODEL_API_MODEL ?? 'muse-spark-1.3', draft, note: 'Draft only. HSSE must review before any use with learners.' };
}
async function resolveEmployee(env, b) {
  let row = null;
  if (b.employee_id != null) row = await env.DB.prepare('select id from employee where id = ?').bind(Number(b.employee_id)).first();
  else if (b.external_id) row = await env.DB.prepare('select id from employee where external_system = ? and external_id = ?').bind(str(b.external_system, 60), str(b.external_id, 120)).first();
  else if (b.odoo_employee_id != null) row = await env.DB.prepare('select id from employee where odoo_employee_id = ?').bind(Number(b.odoo_employee_id)).first();
  else if (b.odoo_login) row = await env.DB.prepare('select id from employee where odoo_login = ?').bind(str(b.odoo_login, 120)).first();
  if (!row) throw fail(404, 'no such employee');
  return row.id;
}

// ---------- admin auth: ADMIN_TOKEN bootstrap (role admin) or individual session ----------
// Password storage: PBKDF2-SHA256 (100k rounds, per-user salt). Legacy rows made by
// the first release are `salt$sha256` with no prefix; they still verify and are
// rehashed to PBKDF2 on the next successful login (see adminLogin).
const hashPassword = async (password) => {
  const salt = randHex(16), rounds = 100000;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: rounds, hash: 'SHA-256' }, key, 256);
  return `pbkdf2$${rounds}$${salt}$${[...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
};
const checkPassword = async (password, stored) => {
  const parts = String(stored).split('$');
  if (parts[0] === 'pbkdf2') {
    const [, rounds, salt, h] = parts;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: Number(rounds), hash: 'SHA-256' }, key, 256);
    return same([...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join(''), h);
  }
  const [salt, h] = parts; return salt && h && same(await sha(`${salt}:${password}`), h); // legacy format
};
async function resolveAdmin(req, env) {
  const m = /^Bearer (.+)$/.exec(req.headers.get('authorization') ?? '');
  if (!m) throw fail(401, 'admin token required');
  if ((env.ADMIN_TOKEN ?? '').length >= 24 && same(await sha(m[1]), await sha(env.ADMIN_TOKEN))) return { type: 'token', name: 'ADMIN_TOKEN', username: 'admin-token', role: 'admin' };
  const sess = await env.DB.prepare(`select u.id, u.username, u.role from admin_session s join admin_user u on u.id = s.admin_user_id
    where s.token_hash = ? and u.active = 1 and s.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`).bind(await sha(m[1])).first();
  if (sess) return { type: 'admin_user', name: sess.username, username: sess.username, role: sess.role, id: sess.id, token: m[1] };
  throw fail(401, 'admin token required');
}
const requireRole = (actor, ...roles) => { if (!roles.includes(actor.role)) throw fail(403, `role ${actor.role} cannot do this (needs ${roles.join(' or ')})`); };

async function admin(req, env, path, actor) {
  const seg = path.split('/');
  switch (`${req.method} ${path}`) {
    case 'GET me': return json({ username: actor.username, role: actor.role, actor_type: actor.type });
    case 'POST logout': {
      if (actor.type === 'admin_user') await env.DB.prepare('delete from admin_session where token_hash = ?').bind(await sha(actor.token)).run();
      return json({});
    }
    case 'GET overview': {
      requireRole(actor, 'hr', 'hsse', 'admin');
      const [{ results: people }, { results: status }] = await env.DB.batch([
        env.DB.prepare('select id, name, odoo_login, odoo_employee_id, external_system, external_id, email, department, site, country, language, active from employee order by name'),
        env.DB.prepare('select employee_id, module, due_date, refresh_months, last_completed, next_due, status from assignment_status order by module'),
      ]);
      return json(people.map((p) => ({ ...p, active: !!p.active, assignments: status.filter((s) => s.employee_id === p.id).map(({ employee_id, ...s }) => s) })));
    }
    case 'GET report.csv': {
      requireRole(actor, 'hr', 'hsse', 'admin');
      const { results } = await env.DB.prepare(`select e.name, e.odoo_login, e.odoo_employee_id, e.department, e.site, e.country, e.language, e.active, s.module, s.status,
        substr(s.last_completed, 1, 10) as last_completed, s.next_due, e.external_system, e.external_id, e.company from employee e join assignment_status s on s.employee_id = e.id order by e.name, s.module`).all();
      return new Response(csv([['name', 'odoo_login', 'odoo_employee_id', 'department', 'site', 'country', 'language', 'active', 'module', 'status', 'last_completed', 'next_due', 'external_system', 'external_id', 'company'],
        ...results.map((r) => [r.name, r.odoo_login, r.odoo_employee_id, r.department, r.site, r.country, r.language, !!r.active, r.module, r.status, r.last_completed, r.next_due, r.external_system, r.external_id, r.company])]),
      { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="hsse-training-report.csv"', 'Cache-Control': 'no-store' } });
    }
    case 'POST employees': {
      requireRole(actor, 'hr', 'admin');
      const out = await importPeople(env, (await body(req)).rows);
      await audit(env, actor, 'employee.import', 'employee', null, { count: out.length });
      return json(out);
    }
    case 'POST employees/delete': {
      requireRole(actor, 'admin');
      const b = await body(req);
      const { meta } = await env.DB.prepare('delete from employee where id = ?').bind(Number(b.id)).run(); // cascades to assignments, completions, quiz results, reminders
      if (!meta.changes) throw fail(404, 'no such employee');
      await audit(env, actor, 'employee.erase', 'employee', b.id);
      return json({});
    }
    case 'POST reset-code': {
      requireRole(actor, 'hr', 'admin');
      const code = newCode();
      const b = await body(req);
      const { meta } = await env.DB.prepare('update employee set code_hash = ? where id = ?').bind(await sha(code), Number(b.id)).run();
      if (!meta.changes) throw fail(404, 'no such employee');
      await audit(env, actor, 'employee.reset_code', 'employee', b.id);
      return json({ code });
    }
    case 'POST active': {
      requireRole(actor, 'hr', 'admin');
      const b = await body(req);
      const { meta } = await env.DB.prepare('update employee set active = ? where id = ?').bind(b.active ? 1 : 0, Number(b.id)).run();
      if (!meta.changes) throw fail(404, 'no such employee');
      await audit(env, actor, b.active ? 'employee.activate' : 'employee.deactivate', 'employee', b.id);
      return json({});
    }
    case 'POST assign': {
      requireRole(actor, 'hsse', 'admin');
      const b = await body(req);
      const assigned = await assignModules(env, b);
      await audit(env, actor, 'assignment.assign', 'assignment', null, { module: b.module, assigned });
      if (assigned) await fireWebhooks(env, 'assignment.created', { module: b.module, employee_ids: b.employee_ids, due_date: b.due_date ?? null });
      return json({ assigned });
    }
    case 'POST unassign': {
      requireRole(actor, 'hsse', 'admin');
      const b = await body(req);
      await env.DB.prepare('delete from assignment where employee_id = ? and module = ?').bind(Number(b.employee_id), moduleId(b.module)).run();
      await audit(env, actor, 'assignment.unassign', 'assignment', b.employee_id, { module: b.module });
      return json({});
    }
    case 'GET users': {
      requireRole(actor, 'admin');
      const { results } = await env.DB.prepare('select id, username, role, active, created_at from admin_user order by username').all();
      return json(results.map((u) => ({ ...u, active: !!u.active })));
    }
    case 'POST users': {
      requireRole(actor, 'admin');
      const b = await body(req);
      const username = str(b.username, 60, true).toLowerCase();
      if (!['hr', 'hsse', 'admin'].includes(b.role)) throw fail(400, 'role must be hr, hsse or admin');
      if (typeof b.password !== 'string' || b.password.length < 10) throw fail(400, 'password must be at least 10 characters');
      const { meta } = await env.DB.prepare('insert into admin_user(username, password_hash, role) values (?,?,?)').bind(username, await hashPassword(b.password), b.role).run();
      await audit(env, actor, 'admin_user.create', 'admin_user', meta.last_row_id, { username, role: b.role });
      return json({ id: meta.last_row_id, username, role: b.role });
    }
    case 'POST users/password': {
      requireRole(actor, 'admin');
      const b = await body(req);
      if (typeof b.password !== 'string' || b.password.length < 10) throw fail(400, 'password must be at least 10 characters');
      const { meta } = await env.DB.prepare('update admin_user set password_hash = ? where id = ?').bind(await hashPassword(b.password), Number(b.id)).run();
      if (!meta.changes) throw fail(404, 'no such user');
      await env.DB.prepare('delete from admin_session where admin_user_id = ?').bind(Number(b.id)).run(); // force re-login everywhere
      await audit(env, actor, 'admin_user.password_reset', 'admin_user', b.id);
      return json({});
    }
    case 'POST users/active': {
      requireRole(actor, 'admin');
      const b = await body(req);
      const { meta } = await env.DB.prepare('update admin_user set active = ? where id = ?').bind(b.active ? 1 : 0, Number(b.id)).run();
      if (!meta.changes) throw fail(404, 'no such user');
      return json({});
    }
    case 'GET api-keys': {
      requireRole(actor, 'admin');
      const { results } = await env.DB.prepare('select id, name, scopes, created_by, created_at, last_used_at, revoked from api_key order by id').all();
      return json(results.map((k) => ({ ...k, revoked: !!k.revoked })));
    }
    case 'POST api-keys': {
      requireRole(actor, 'admin');
      const b = await body(req);
      const scopes = String(b.scopes ?? 'read').split(',').map((s) => s.trim()).filter(Boolean);
      if (!scopes.length || scopes.some((s) => !['read', 'write', 'admin'].includes(s))) throw fail(400, 'scopes must be a comma list of read, write, admin');
      const key = `es_live_${randHex(24)}`;
      const { meta } = await env.DB.prepare('insert into api_key(name, key_hash, scopes, created_by) values (?,?,?,?)').bind(str(b.name, 80, true), await sha(key), scopes.join(','), actor.name).run();
      await audit(env, actor, 'api_key.create', 'api_key', meta.last_row_id, { scopes });
      return json({ id: meta.last_row_id, key, scopes }, 201);
    }
    case 'POST api-keys/revoke': {
      requireRole(actor, 'admin');
      const b = await body(req);
      const { meta } = await env.DB.prepare('update api_key set revoked = 1 where id = ?').bind(Number(b.id)).run();
      if (!meta.changes) throw fail(404, 'no such API key');
      await audit(env, actor, 'api_key.revoke', 'api_key', b.id);
      return json({});
    }
    case 'GET webhooks': {
      requireRole(actor, 'admin');
      const { results } = await env.DB.prepare('select id, url, events, active, created_by, created_at from webhook order by id').all();
      return json(results.map((w) => ({ ...w, active: !!w.active })));
    }
    case 'POST webhooks': {
      requireRole(actor, 'admin');
      const b = await body(req);
      const url = str(b.url, 500, true);
      if (!webhookUrlOk(url)) throw fail(400, 'webhook url must be https (http allowed only for localhost)');
      const secret = `whsec_${randHex(24)}`;
      const events = str(b.events, 200) ?? 'completion.created';
      const { meta } = await env.DB.prepare('insert into webhook(url, secret, events, created_by) values (?,?,?,?)').bind(url, secret, events, actor.name).run();
      await audit(env, actor, 'webhook.create', 'webhook', meta.last_row_id, { url, events });
      return json({ id: meta.last_row_id, url, events, secret }, 201);
    }
    case 'POST webhooks/active': {
      requireRole(actor, 'admin');
      const b = await body(req);
      const { meta } = await env.DB.prepare('update webhook set active = ? where id = ?').bind(b.active ? 1 : 0, Number(b.id)).run();
      if (!meta.changes) throw fail(404, 'no such webhook');
      return json({});
    }
    case 'GET webhook-deliveries': {
      requireRole(actor, 'admin');
      const { results } = await env.DB.prepare('select id, webhook_id, event, status, response_code, created_at from webhook_delivery order by id desc limit 100').all();
      return json(results);
    }
    case 'GET viva': {
      requireRole(actor, 'hr', 'hsse', 'admin');
      const { results } = await env.DB.prepare(`select v.id, e.name, v.module, v.status, v.score, v.self_mark, v.transcript, v.feedback_sw, v.created_at
        from viva_result v join employee e on e.id = v.employee_id order by v.id desc limit 50`).all();
      return json(results);
    }
    case 'GET quiz-stats': {
      requireRole(actor, 'hr', 'hsse', 'admin');
      const { results: perModule } = await env.DB.prepare(`select module, count(*) as attempts, sum(correct) as correct from quiz_result group by module order by module`).all();
      const { results: missed } = await env.DB.prepare(`select module, step, count(*) as attempts, sum(1 - correct) as wrong from quiz_result group by module, step having wrong > 0 order by wrong desc, attempts desc limit 20`).all();
      const { results: people } = await env.DB.prepare(`select count(distinct employee_id) as learners, count(*) as answers from quiz_result`).all();
      return json({ per_module: perModule.map((r) => ({ ...r, pct_correct: r.attempts ? Math.round((100 * r.correct) / r.attempts) : null })), most_missed: missed, learners: people[0]?.learners ?? 0, answers: people[0]?.answers ?? 0 });
    }
    case 'GET quiz-results.csv': {
      requireRole(actor, 'hr', 'hsse', 'admin');
      const { results } = await env.DB.prepare(`select e.name, e.external_system, e.external_id, e.department, e.company, q.module, q.step, q.correct, q.answered_at
        from quiz_result q join employee e on e.id = q.employee_id order by q.answered_at`).all();
      return new Response(csv([['name', 'external_system', 'external_id', 'department', 'company', 'module', 'question', 'correct', 'answered_at'],
        ...results.map((r) => [r.name, r.external_system, r.external_id, r.department, r.company, r.module, r.step, r.correct ? 'yes' : 'no', r.answered_at])]),
      { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="hsse-quiz-results.csv"', 'Cache-Control': 'no-store' } });
    }
    case 'POST reminders/run': {
      requireRole(actor, 'hsse', 'admin');
      const b = await body(req).catch(() => ({}));
      const result = await runReminders(env, { dryRun: !!b.dry_run });
      await audit(env, actor, 'reminder.run', 'reminder', null, { total: result.total, sent: result.sent, dry_run: !!b.dry_run });
      return json(result);
    }
    case 'GET reminders': {
      requireRole(actor, 'hr', 'hsse', 'admin');
      const { results } = await env.DB.prepare(`select r.id, e.name, r.module, r.kind, r.status, r.detail, r.created_at from reminder_log r join employee e on e.id = r.employee_id order by r.id desc limit 100`).all();
      return json(results);
    }
    case 'GET scenario': {
      requireRole(actor, 'hr', 'hsse', 'admin');
      return json(await ensureScenario(env));
    }
    case 'POST ai-scenario': {
      requireRole(actor, 'hsse', 'admin');
      const b = await body(req).catch(() => ({}));
      const result = await draftScenario(env, b);
      await audit(env, actor, 'ai.scenario_draft', 'monthly_scenario', result.based_on, { model: result.model });
      return json(result);
    }
    case 'POST scenario/run': {
      requireRole(actor, 'hsse', 'admin');
      const result = await distributeScenario(env);
      await audit(env, actor, 'scenario.run', 'monthly_scenario', result.scenario.month, { sent: result.sent });
      return json(result);
    }
    case 'GET audit': {
      requireRole(actor, 'admin');
      const { results } = await env.DB.prepare('select id, actor_type, actor, action, entity, entity_id, detail, created_at from audit_log order by id desc limit 200').all();
      return json(results);
    }
    default:
      if (req.method === 'DELETE' && seg[0] === 'webhooks' && seg[1]) {
        requireRole(actor, 'admin');
        await env.DB.prepare('delete from webhook where id = ?').bind(Number(seg[1])).run();
        return json({});
      }
      throw fail(404, 'no such admin route');
  }
}

async function adminLogin(req, env) {
  if (env.LIMITER) { const { success } = await env.LIMITER.limit({ key: `login:${req.headers.get('cf-connecting-ip') ?? 'local'}` }); if (!success) throw fail(429, 'too many sign-in attempts, wait a minute'); }
  const b = await body(req);
  const user = await env.DB.prepare('select id, username, password_hash, role from admin_user where username = ? and active = 1').bind(str(b.username, 60)?.toLowerCase()).first();
  if (!user || !(await checkPassword(String(b.password ?? ''), user.password_hash))) throw fail(401, 'username or password not recognised');
  if (!String(user.password_hash).startsWith('pbkdf2$')) await env.DB.prepare('update admin_user set password_hash = ? where id = ?').bind(await hashPassword(String(b.password)), user.id).run();
  const token = randHex(32);
  await env.DB.prepare("insert into admin_session(token_hash, admin_user_id, expires_at) values (?,?, strftime('%Y-%m-%dT%H:%M:%fZ','now','+7 days'))").bind(await sha(token), user.id).run();
  await audit(env, { type: 'admin_user', name: user.username }, 'auth.login', 'admin_user', user.id);
  return json({ token, username: user.username, role: user.role });
}

// ---------- staff API (phone) ----------
async function api(req, env, path) {
  const who = await staff(req, env);
  if (req.method === 'GET' && path === 'me') {
    const { results } = await env.DB.prepare('select module, due_date, next_due, status from assignment_status where employee_id = ? order by module').bind(who.id).all();
    const scenario = await ensureScenario(env).catch(() => null);
    return json({ name: who.name, assignments: results, scenario });
  }
  if (req.method === 'POST' && path === 'complete') {
    const b = await body(req);
    let at = new Date(b.at);
    if (Number.isNaN(+at) || +at > Date.now() || +at < Date.now() - 90 * 864e5) at = new Date();
    await recordCompletion(env, who.id, b.module, at.toISOString(), 'staff');
    return json({});
  }
  if (req.method === 'POST' && path === 'viva') {
    const b = await body(req);
    const mod = lessons.modules.find((m) => m.id === b.module);
    if (!mod?.viva) throw fail(400, 'module has no voice question');
    if (b.self) {
      if (!['good', 'learning'].includes(b.self)) throw fail(400, 'self must be good or learning');
      await env.DB.prepare("insert into viva_result(employee_id, module, status, self_mark) values (?,?,'self',?)").bind(who.id, mod.id, b.self).run();
      return json({ status: 'self' });
    }
    // Cost guard: the key never leaves the server, callers need a personal code, and
    // caps bound the spend even if a code leaks (ASR is ~$3 per 1000 minutes).
    if (!env.MODEL_API_KEY) throw Object.assign(fail(503, 'Meta Model API key not configured'), { code: 'no_meta_key' });
    const mineToday = (await env.DB.prepare("select count(*) as n from viva_result where employee_id = ? and status = 'graded' and created_at > strftime('%Y-%m-%dT%H:%M:%fZ','now','start of day')").bind(who.id).first()).n;
    if (mineToday >= 6) throw fail(429, 'daily voice-question limit reached');
    const cap = Number(env.VIVA_DAILY_CAP ?? 200);
    const allToday = (await env.DB.prepare("select count(*) as n from viva_result where status = 'graded' and created_at > strftime('%Y-%m-%dT%H:%M:%fZ','now','start of day')").first()).n;
    if (allToday >= cap) throw Object.assign(fail(503, 'daily voice-question budget reached'), { code: 'viva_cap' });
    const secs = Number(b.secs ?? 0);
    if (!b.audio_b64 || secs < 1 || secs > 30 || String(b.audio_b64).length > 1400000) throw fail(400, 'send audio_b64 (WAV, up to 30 seconds)');
    const wav = Uint8Array.from(atob(String(b.audio_b64)), (c) => c.charCodeAt(0));
    const form = new FormData();
    form.append('request', new Blob([JSON.stringify({ mode: 'ENDPOINTING', model: env.ASR_MODEL ?? 'muse-voice-transcribe-1.0', audioEncoding: 'WAV', keywords: ['pikipiki', 'ngazi', 'kufuli', 'kizima moto', 'msimamizi', 'forklift', 'matairi'] })], { type: 'application/json' }));
    form.append('audio', new Blob([wav], { type: 'audio/wav' }), 'answer.wav');
    const asr = await fetch(`https://api.meta.ai/v1/asr/transcribe?sessionId=viva-${who.id}-${Date.now()}`, { method: 'POST', headers: { Authorization: `Bearer ${env.MODEL_API_KEY}` }, body: form, signal: AbortSignal.timeout(45000) });
    if (!asr.ok) throw fail(502, `speech API returned HTTP ${asr.status}`);
    const transcript = String((await asr.json()).transcript ?? '').trim();
    if (!transcript) { await env.DB.prepare("insert into viva_result(employee_id, module, status, secs) values (?,?,'no_speech',?)").bind(who.id, mod.id, secs).run(); return json({ status: 'no_speech' }); }
    const keys = mod.viva.points.map((pt, i) => `${i + 1}. ${pt.en}`).join('\n');
    const grade = await fetch(`${env.MODEL_API_URL ?? 'https://api.meta.ai/v1'}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.MODEL_API_KEY}` },
      body: JSON.stringify({ model: env.MODEL_API_MODEL ?? 'muse-spark-1.3', temperature: 0, messages: [{ role: 'user', content: `Grade this spoken safety-training answer. Question: "${mod.viva.q.en}" Key points:\n${keys}\nLearner transcript (may be Kiswahili, English or mixed, and may contain speech-recognition errors — grade the meaning, not the wording): "${transcript}" Score = how many key points are clearly covered (0-3). Reply with only JSON: {"score":0,"feedback_sw":"","feedback_en":""} with one short encouraging feedback sentence in Kiswahili and the same in English, naming a missed point if any.` }] }), signal: AbortSignal.timeout(30000) });
    if (!grade.ok) throw fail(502, `grading API returned HTTP ${grade.status}`);
    let g; try { g = JSON.parse(String((await grade.json()).choices?.[0]?.message?.content ?? '').replace(/^```json?|```$/gm, '').trim()); } catch { throw fail(502, 'grading did not return JSON'); }
    const score = Math.max(0, Math.min(3, Number(g.score) || 0));
    await env.DB.prepare("insert into viva_result(employee_id, module, status, transcript, score, feedback_sw, feedback_en, secs) values (?,?,'graded',?,?,?,?,?)")
      .bind(who.id, mod.id, transcript.slice(0, 2000), score, String(g.feedback_sw ?? '').slice(0, 300), String(g.feedback_en ?? '').slice(0, 300), secs).run();
    return json({ status: 'graded', score, total: 3, feedback: { sw: g.feedback_sw, en: g.feedback_en }, transcript });
  }
  if (req.method === 'POST' && path === 'quiz') {
    const b = await body(req);
    const recorded = await recordQuiz(env, who.id, b.results, 'staff');
    return json({ recorded });
  }
  throw fail(404, 'no such route');
}

// ---------- external ERP/HRM API v1 (API-key auth) ----------
async function apiKeyAuth(req, env, need) {
  const raw = req.headers.get('x-api-key') ?? /^Bearer (.+)$/.exec(req.headers.get('authorization') ?? '')?.[1];
  if (!raw) throw fail(401, 'API key required (X-API-Key or Authorization: Bearer)');
  const row = await env.DB.prepare('select id, name, scopes from api_key where key_hash = ? and revoked = 0').bind(await sha(raw)).first();
  if (!row) throw fail(401, 'API key not recognised');
  const scopes = String(row.scopes).split(',').map((s) => s.trim());
  if (!scopes.includes('admin') && !scopes.includes(need)) throw fail(403, `API key needs the ${need} scope`);
  env.DB.prepare("update api_key set last_used_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') where id = ?").bind(row.id).run().catch(() => {});
  return { type: 'api_key', name: row.name, id: row.id, scopes };
}
async function v1(req, env, path, url) {
  if (path === 'health') return json({ ok: true, version: 1, default_language: 'sw' });
  const actor = await apiKeyAuth(req, env, req.method === 'GET' ? 'read' : 'write');
  const seg = path.split('/');
  const { limit, offset } = page(url);
  const list = async (sql, binds, countSql, countBinds) => {
    const { results } = await env.DB.prepare(sql).bind(...binds, limit, offset).all();
    const total = countSql ? (await env.DB.prepare(countSql).bind(...countBinds).first())?.n ?? results.length : results.length;
    return json({ data: results, limit, offset, total });
  };
  if (req.method === 'GET' && path === 'modules')
    return json({ data: lessons.modules.map((m) => ({ id: m.id, title: m.title, track: m.track ?? 'rider', steps: m.steps.length, submodules: (m.submodules ?? []).map((s) => ({ id: s.id, title: s.title, steps: s.steps.length })) })) });
  if (req.method === 'GET' && path === 'employees') {
    const w = [], b = [];
    for (const [k, col] of [['country', 'country'], ['department', 'department'], ['site', 'site'], ['language', 'language']]) if (url.searchParams.get(k)) { w.push(`${col} = ?`); b.push(url.searchParams.get(k)); }
    if (url.searchParams.get('active') != null) { w.push('active = ?'); b.push(url.searchParams.get('active') === 'true' ? 1 : 0); }
    if (url.searchParams.get('q')) { w.push('(name like ? or odoo_login like ? or external_id like ?)'); const q = `%${url.searchParams.get('q')}%`; b.push(q, q, q); }
    const where = w.length ? `where ${w.join(' and ')}` : '';
    const { results } = await env.DB.prepare(`select * from employee ${where} order by name limit ? offset ?`).bind(...b, limit, offset).all();
    const total = (await env.DB.prepare(`select count(*) as n from employee ${where}`).bind(...b).first()).n;
    return json({ data: results.map(empShape), limit, offset, total });
  }
  if (req.method === 'POST' && path === 'employees') {
    const b = await body(req);
    const out = await importPeople(env, b.rows ?? [b]);
    await audit(env, actor, 'employee.import', 'employee', null, { count: out.length, via: 'api' });
    return json({ data: out }, 201);
  }
  if (seg[0] === 'employees' && seg[1] && req.method === 'GET') {
    const p = await env.DB.prepare('select * from employee where id = ?').bind(Number(seg[1])).first();
    if (!p) throw fail(404, 'no such employee');
    const { results } = await env.DB.prepare('select module, due_date, refresh_months, last_completed, next_due, status from assignment_status where employee_id = ? order by module').bind(p.id).all();
    return json({ data: { ...empShape(p), assignments: results } });
  }
  if (seg[0] === 'employees' && seg[1] && req.method === 'PATCH') {
    const b = await body(req);
    const cur = await env.DB.prepare('select * from employee where id = ?').bind(Number(seg[1])).first();
    if (!cur) throw fail(404, 'no such employee');
    const f = { name: b.name !== undefined ? str(b.name, 120, true) : cur.name, email: b.email !== undefined ? str(b.email, 160) : cur.email,
      department: b.department !== undefined ? str(b.department, 80) : cur.department, site: b.site !== undefined ? str(b.site, 80) : cur.site,
      country: countryOf(b.country, cur.country), language: langOf(b.language, cur.language),
      external_system: b.external_system !== undefined ? str(b.external_system, 60) : cur.external_system, external_id: b.external_id !== undefined ? str(b.external_id, 120) : cur.external_id,
      active: b.active !== undefined ? (b.active ? 1 : 0) : cur.active };
    await env.DB.prepare('update employee set name=?, email=?, department=?, site=?, country=?, language=?, external_system=?, external_id=?, active=? where id=?')
      .bind(f.name, f.email, f.department, f.site, f.country, f.language, f.external_system, f.external_id, f.active, cur.id).run();
    await audit(env, actor, 'employee.update', 'employee', cur.id, { via: 'api' });
    return json({ data: empShape({ ...cur, ...f }) });
  }
  if (req.method === 'GET' && path === 'assignments') {
    const w = [], b = [];
    if (url.searchParams.get('employee_id')) { w.push('s.employee_id = ?'); b.push(Number(url.searchParams.get('employee_id'))); }
    if (url.searchParams.get('module')) { w.push('s.module = ?'); b.push(moduleId(url.searchParams.get('module'))); }
    if (url.searchParams.get('status')) { w.push('s.status = ?'); b.push(url.searchParams.get('status')); }
    if (url.searchParams.get('country')) { w.push('e.country = ?'); b.push(countryOf(url.searchParams.get('country'))); }
    const where = w.length ? `where ${w.join(' and ')}` : '';
    return list(`select s.employee_id, e.name, e.country, s.module, s.due_date, s.refresh_months, s.last_completed, s.next_due, s.status from assignment_status s join employee e on e.id = s.employee_id ${where} order by e.name, s.module limit ? offset ?`, b,
      `select count(*) as n from assignment_status s join employee e on e.id = s.employee_id ${where}`, b);
  }
  if (req.method === 'POST' && path === 'assignments') {
    const b = await body(req);
    const assigned = await assignModules(env, b);
    await audit(env, actor, 'assignment.assign', 'assignment', null, { module: b.module, assigned, via: 'api' });
    if (assigned) await fireWebhooks(env, 'assignment.created', { module: b.module, employee_ids: b.employee_ids, due_date: b.due_date ?? null, source: 'api' });
    return json({ data: { assigned } }, 201);
  }
  if (req.method === 'DELETE' && path === 'assignments') {
    const b = await body(req).catch(() => ({}));
    const emp = url.searchParams.get('employee_id') ?? b.employee_id, mod = url.searchParams.get('module') ?? b.module;
    if (!emp || !mod) throw fail(400, 'employee_id and module are required');
    await env.DB.prepare('delete from assignment where employee_id = ? and module = ?').bind(Number(emp), moduleId(mod)).run();
    return json({ data: {} });
  }
  if (req.method === 'GET' && path === 'completions') {
    const w = [], b = [];
    if (url.searchParams.get('employee_id')) { w.push('employee_id = ?'); b.push(Number(url.searchParams.get('employee_id'))); }
    if (url.searchParams.get('module')) { w.push('module = ?'); b.push(moduleId(url.searchParams.get('module'))); }
    if (url.searchParams.get('since')) { w.push('completed_at >= ?'); b.push(url.searchParams.get('since')); }
    if (url.searchParams.get('until')) { w.push('completed_at <= ?'); b.push(url.searchParams.get('until')); }
    const where = w.length ? `where ${w.join(' and ')}` : '';
    return list(`select employee_id, module, completed_at, source from completion ${where} order by completed_at desc limit ? offset ?`, b, `select count(*) as n from completion ${where}`, b);
  }
  if (req.method === 'POST' && path === 'completions') {
    const b = await body(req);
    const empId = await resolveEmployee(env, b);
    let at = new Date(b.completed_at ?? b.at ?? Date.now());
    if (Number.isNaN(+at)) throw fail(400, 'completed_at must be an ISO date/time');
    if (+at > Date.now() + 864e5) throw fail(400, 'completed_at cannot be in the future'); // a future date would hold status current for years
    const changed = await recordCompletion(env, empId, b.module, at.toISOString(), 'api');
    await audit(env, actor, 'completion.create', 'completion', empId, { module: b.module, via: 'api' });
    return json({ data: { employee_id: empId, module: b.module, completed_at: at.toISOString(), recorded: !!changed } }, changed ? 201 : 200);
  }
  if (req.method === 'GET' && path === 'status') {
    const { results } = await env.DB.prepare(`select s.status, count(*) as n from assignment_status s group by s.status`).all();
    const { results: byModule } = await env.DB.prepare(`select module, status, count(*) as n from assignment_status group by module, status order by module`).all();
    const { results: byCountry } = await env.DB.prepare(`select e.country, s.status, count(*) as n from assignment_status s join employee e on e.id = s.employee_id group by e.country, s.status order by e.country`).all();
    return json({ data: { by_status: Object.fromEntries(results.map((r) => [r.status, r.n])), by_module: byModule, by_country: byCountry } });
  }
  if (req.method === 'GET' && path === 'quiz-results') {
    const w = [], b = [];
    if (url.searchParams.get('employee_id')) { w.push('employee_id = ?'); b.push(Number(url.searchParams.get('employee_id'))); }
    if (url.searchParams.get('module')) { w.push('module = ?'); b.push(moduleId(url.searchParams.get('module'))); }
    if (url.searchParams.get('since')) { w.push('answered_at >= ?'); b.push(url.searchParams.get('since')); }
    const where = w.length ? `where ${w.join(' and ')}` : '';
    return list(`select employee_id, module, step, correct, answered_at, source from quiz_result ${where} order by answered_at desc limit ? offset ?`, b, `select count(*) as n from quiz_result ${where}`, b);
  }
  if (req.method === 'POST' && path === 'quiz-results') {
    const b = await body(req);
    const empId = await resolveEmployee(env, b);
    const recorded = await recordQuiz(env, empId, b.results ?? [b], 'api');
    return json({ data: { employee_id: empId, recorded } }, 201);
  }
  if (seg[0] === 'webhooks') {
    if (!actor.scopes.includes('admin')) throw fail(403, 'API key needs the admin scope for webhooks');
    if (req.method === 'GET' && seg.length === 1) { const { results } = await env.DB.prepare('select id, url, events, active, created_at from webhook order by id').all(); return json({ data: results.map((w) => ({ ...w, active: !!w.active })) }); }
    if (req.method === 'POST' && seg.length === 1) {
      const b = await body(req); const url2 = str(b.url, 500, true);
      if (!webhookUrlOk(url2)) throw fail(400, 'webhook url must be https (http allowed only for localhost)');
      const secret = `whsec_${randHex(24)}`; const events = str(b.events, 200) ?? 'completion.created';
      const { meta } = await env.DB.prepare('insert into webhook(url, secret, events, created_by) values (?,?,?,?)').bind(url2, secret, events, actor.name).run();
      return json({ data: { id: meta.last_row_id, url: url2, events, secret } }, 201);
    }
    if (req.method === 'DELETE' && seg[1]) { await env.DB.prepare('delete from webhook where id = ?').bind(Number(seg[1])).run(); return json({ data: {} }); }
  }
  throw fail(404, 'no such route');
}

export default {
  // Cron (wrangler.jsonc triggers): weekly reminder run; on the monthly trigger also
  // generate and distribute this month's safety scenario. wrangler dev does not fire
  // cron locally; HSSE can run the same work any time from /admin (Reminders section).
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      if (String(event.cron).startsWith('0 6 1')) await distributeScenario(env);
      await runReminders(env);
      // Retention (docs/PRIVACY.md): expired sessions go at once, delivery receipts after 90 days.
      await env.DB.batch([
        env.DB.prepare("delete from admin_session where expires_at < strftime('%Y-%m-%dT%H:%M:%fZ','now')"),
        env.DB.prepare("delete from webhook_delivery where created_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-90 days')"),
      ]).catch(() => {});
    })());
  },
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const { pathname } = url;
    try {
      if (pathname === '/admin' || pathname === '/admin/') {
        return new Response(adminHtml, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer',
          'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; font-src 'self'; img-src 'self' data:" } });
      }
      if (pathname === '/admin/api/login') return await adminLogin(req, env);
      if (pathname.startsWith('/admin/api/')) {
        if ((env.ADMIN_TOKEN ?? '').length < 24 && !(await env.DB.prepare('select 1 from admin_user limit 1').first().catch(() => null))) throw fail(500, 'ADMIN_TOKEN secret is missing or shorter than 24 characters');
        const actor = await resolveAdmin(req, env);
        return await admin(req, env, pathname.slice('/admin/api/'.length), actor);
      }
      if (pathname.startsWith('/api/v1/')) return await v1(req, env, pathname.slice('/api/v1/'.length), url);
      if (pathname.startsWith('/api/')) return await api(req, env, pathname.slice('/api/'.length));
      if (pathname === '/') return env.ASSETS.fetch(new Request(new URL('/index.html', req.url), req));
      return env.ASSETS.fetch(req);
    } catch (e) {
      const status = e.status ?? (/constraint/i.test(e.message) ? 409 : 500);
      if (status >= 500) console.error(e);
      return json({ error: status < 500 || e.status ? e.message : 'server error', ...(e.code ? { code: e.code } : {}) }, status);
    }
  },
};
