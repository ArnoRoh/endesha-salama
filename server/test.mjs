// Smoke test of the real Worker (wrangler dev, local D1 in a throwaway folder).  npm run test:server
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';

const dir = mkdtempSync(join(tmpdir(), 'hsse-test-'));
const adminToken = randomBytes(16).toString('hex');
const port = 20000 + Math.floor(Math.random() * 20000);
const wrangler = (...args) => execFileSync('npx', ['wrangler', ...args, '--local', '--persist-to', dir], { stdio: 'pipe' }).toString();
const sql = (command) => wrangler('d1', 'execute', 'hsse', '--command', command);
wrangler('d1', 'migrations', 'apply', 'hsse');
const dev = spawn('npx', ['wrangler', 'dev', '--ip', '127.0.0.1', '--port', String(port), '--persist-to', dir,
  '--var', `ADMIN_TOKEN:${adminToken}`, '--show-interactive-dev-session=false'], { stdio: 'pipe', detached: true });
const base = `http://127.0.0.1:${port}`;
for (let i = 0; ; i++) {
  if (await fetch(`${base}/lessons.json`).then((r) => r.ok, () => false)) break;
  if (i > 120) throw new Error('wrangler dev did not start');
  await new Promise((r) => setTimeout(r, 500));
}
const adm = (path, data) => fetch(`${base}/admin/api/${path}`, { method: data ? 'POST' : 'GET', headers: { Authorization: `Bearer ${adminToken}` }, body: data && JSON.stringify(data) });
const me = (code) => fetch(`${base}/api/me`, { headers: { 'X-Staff-Code': code } });
const done = (code, data) => fetch(`${base}/api/complete`, { method: 'POST', headers: { 'X-Staff-Code': code }, body: JSON.stringify(data) });
const overview = async () => Object.fromEntries((await (await adm('overview')).json()).map((p) => [p.name, p]));
try {
  assert.equal((await fetch(`${base}/admin/api/overview`)).status, 401, 'admin needs token');
  assert.equal((await fetch(`${base}/admin/api/overview`, { headers: { Authorization: 'Bearer nope' } })).status, 401);
  assert.equal((await adm('employees', { rows: [{ name: 'No Key' }] })).status, 400, 'Odoo link is required');

  const [amina, juma] = await (await adm('employees', { rows: [
    { name: 'Test Person A', odoo_login: 'person.a@example.invalid', odoo_employee_id: '142', department: 'Test Dept' },
    { name: '=Test Formula', odoo_login: 'formula@example.invalid' }] })).json();
  assert.ok(amina.created && /^[A-Z2-9]{8}$/.test(amina.code) && Number.isInteger(amina.id));
  const again = await (await adm('employees', { rows: [{ name: 'Test Person A2', odoo_employee_id: 142, site: 'Test Site' }] })).json();
  assert.deepEqual([again[0].id, again[0].created, again[0].code], [amina.id, false, undefined], 'upsert by Odoo id keeps the same person and code');
  assert.equal((await overview())['Test Person A2'].odoo_login, 'person.a@example.invalid', 'blank import fields do not erase data');

  assert.equal((await adm('employees', { rows: [{ name: 'Half Import', odoo_login: 'half@example.invalid' }, { name: 'No Key' }] })).status, 400);
  assert.equal((await adm('employees', { rows: [{ name: 'Twin A', odoo_login: 'twin@example.invalid' }, { name: 'Twin B', odoo_login: 'twin@example.invalid' }] })).status, 400);
  assert.equal((await adm('employees', { rows: [{ name: 'Half Import', odoo_login: 'half@example.invalid' }, { name: 'Clash', odoo_login: 'formula@example.invalid', odoo_employee_id: 142 }] })).status, 409);
  assert.equal((await overview())['Half Import'], undefined, 'a failed import saves nothing');
  assert.equal((await adm('assign', { employee_ids: [amina.id], module: 'check', due_date: '2026-02-31' })).status, 400, 'impossible date is a 400');
  assert.equal((await adm('active', { id: 999999, active: false })).status, 404);
  assert.equal((await adm('assign', { employee_ids: [amina.id, juma.id], module: 'nope' })).status, 400);
  assert.equal((await (await adm('assign', { employee_ids: [amina.id, juma.id], module: 'check', due_date: '2999-01-01', refresh_months: 6 })).json()).assigned, 2);
  assert.equal((await overview())['Test Person A2'].assignments[0].status, 'pending');

  assert.equal((await me('WRONGCODE')).status, 401);
  const mine = await (await me(` ${amina.code.toLowerCase()} `)).json();
  assert.equal(mine.name, 'Test Person A2');
  assert.equal(mine.assignments[0].status, 'pending');

  assert.equal((await done(amina.code, { module: 'check' })).status, 200);
  assert.equal((await done(amina.code, { module: 'bogus' })).status, 400);
  const a = (await overview())['Test Person A2'].assignments[0];
  assert.equal(a.status, 'current');
  const months = (new Date(a.next_due) - Date.now()) / 864e5 / 30.4;
  assert.ok(months > 5.7 && months < 6.1, `next due ~6 months out, got ${months}`);

  // Refresh logic: 7 months ago is overdue, 5.5 months ago is due soon. Phone clocks cannot fake old dates.
  const ago = (d) => new Date(Date.now() - d * 864e5).toISOString();
  sql(`delete from completion; insert into completion(employee_id, module, completed_at) values (${amina.id}, 'check', '${ago(215)}'), (${juma.id}, 'check', '${ago(165)}');`);
  const o = await overview();
  assert.equal(o['Test Person A2'].assignments[0].status, 'overdue');
  assert.equal(o['=Test Formula'].assignments[0].status, 'due_soon');
  await done(juma.code, { module: 'check', at: ago(400) });
  assert.match(sql(`select count(*) as n from completion where employee_id = ${juma.id}`), /"n": 2/, 'old client date is replaced by server time');

  const csv = await (await adm('report.csv')).text();
  assert.ok(csv.startsWith('"name","odoo_login"') && csv.includes(`"'=Test Formula"`) && csv.includes('"overdue"'), 'csv has data and neutralises formulas');

  const reset = await (await adm('reset-code', { id: amina.id })).json();
  assert.equal((await me(amina.code)).status, 401, 'old code stops working');
  assert.equal((await me(reset.code)).status, 200);
  await adm('active', { id: amina.id, active: false });
  assert.equal((await me(reset.code)).status, 401, 'deactivated person is locked out');

  // --- roles: HR imports, HSSE assigns, neither can do the other's job ---
  await adm('users', { username: 'hr.one', password: 'hr-password-1', role: 'hr' });
  await adm('users', { username: 'hsse.one', password: 'hsse-password-1', role: 'hsse' });
  const login = async (u, p) => (await (await fetch(`${base}/admin/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) })).json()).token;
  const hrTok = await login('hr.one', 'hr-password-1'), hsseTok = await login('hsse.one', 'hsse-password-1');
  assert.ok(hrTok && hsseTok, 'admin users can log in');
  assert.equal((await fetch(`${base}/admin/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'hr.one', password: 'wrong-password' }) })).status, 401);
  const as = (tok, path, data) => fetch(`${base}/admin/api/${path}`, { method: data ? 'POST' : 'GET', headers: { Authorization: `Bearer ${tok}` }, body: data && JSON.stringify(data) });
  assert.equal((await as(hrTok, 'assign', { employee_ids: [amina.id], module: 'fire' })).status, 403, 'HR cannot assign training');
  assert.equal((await as(hsseTok, 'employees', { rows: [{ name: 'Nope', odoo_login: 'nope@example.invalid' }] })).status, 403, 'HSSE cannot import people');
  assert.equal((await as(hsseTok, 'api-keys')).status, 403, 'HSSE cannot list API keys');
  const [kePerson] = await (await as(hrTok, 'employees', { rows: [{ name: 'Kenya Person', external_system: 'erpnext', external_id: 'KE-001', country: 'KE', language: 'sw', department: 'Ops' }] })).json();
  assert.ok(kePerson.created && kePerson.id, 'HR import with generic external ID and country works');
  assert.equal((await overview())['Kenya Person'].country, 'KE');

  // --- external ERP/HRM API v1 ---
  assert.equal((await fetch(`${base}/api/v1/health`)).status, 200, 'v1 health is public');
  assert.equal((await fetch(`${base}/api/v1/employees`)).status, 401, 'v1 needs an API key');
  const rwKey = (await (await adm('api-keys', { name: 'read-only', scopes: 'read' })).json());
  assert.match(rwKey.key, /^es_live_/);
  const v1 = (key, path, data) => fetch(`${base}/api/v1/${path}`, { method: data ? (path === 'completions' || path === 'employees' || path === 'assignments' ? 'POST' : 'POST') : 'GET', headers: { 'X-API-Key': key }, body: data && JSON.stringify(data) });
  assert.equal((await v1(rwKey.key, 'employees', { name: 'Blocked', external_system: 'x', external_id: '1' })).status, 403, 'read-only key cannot write');
  const fullKey = (await (await adm('api-keys', { name: 'erp', scopes: 'read,write' })).json()).key;
  const ug = await (await v1(fullKey, 'employees', { name: 'Uganda Person', external_system: 'odoo', external_id: 'UG-9', country: 'UG', language: 'en' })).json();
  assert.equal(ug.data[0].created, true, 'v1 creates employee by external ID');
  const ugId = ug.data[0].id;
  const listKe = await (await v1(fullKey, 'employees?country=KE')).json();
  assert.ok(listKe.data.some((p) => p.name === 'Kenya Person') && !listKe.data.some((p) => p.name === 'Uganda Person'), 'v1 employee filter by country');
  assert.equal((await v1(fullKey, 'assignments', { employee_ids: [ugId], module: 'fire', due_date: '2999-01-01' })).status, 201);
  const nowIso = new Date().toISOString();
  const comp = await v1(fullKey, 'completions', { external_system: 'odoo', external_id: 'UG-9', module: 'fire', completed_at: nowIso });
  assert.equal(comp.status, 201);
  assert.equal((await (await v1(fullKey, 'completions', { employee_id: ugId, module: 'fire', completed_at: nowIso })).json()).data.recorded, false, 're-sending the same completion is idempotent');
  const st = await (await v1(fullKey, 'status')).json();
  assert.ok(st.data.by_status.current >= 1, 'v1 status summary counts current');
  const mods1 = await (await v1(fullKey, 'modules')).json();
  assert.ok(mods1.data.find((m) => m.id === 'fire')?.submodules.length === 4, 'v1 lists modules with submodules');

  // --- webhook fires on completion, signed ---
  const seen = [];
  const receiver = createServer((rq, rs) => { let b = ''; rq.on('data', (c) => (b += c)); rq.on('end', () => { seen.push({ sig: rq.headers['x-endesha-signature'], event: rq.headers['x-endesha-event'], b }); rs.end('ok'); }); });
  await new Promise((r) => receiver.listen(0, '127.0.0.1', r));
  const hook = await (await adm('webhooks', { url: `http://127.0.0.1:${receiver.address().port}/hook`, events: 'completion.created' })).json();
  assert.match(hook.secret, /^whsec_/);
  await v1(fullKey, 'completions', { employee_id: ugId, module: 'lift' });
  receiver.close();
  assert.equal(seen.length, 1, 'webhook delivered once');
  assert.equal(seen[0].event, 'completion.created');
  assert.match(seen[0].sig, /^sha256=[0-9a-f]{64}$/);
  assert.ok(JSON.parse(seen[0].b).data.module === 'lift');

  // revoked key stops working
  const keysList = await (await adm('api-keys')).json();
  await adm('api-keys/revoke', { id: keysList.find((k) => k.name === 'erp').id });
  assert.equal((await v1(fullKey, 'employees')).status, 401, 'revoked API key is rejected');
  const auditRows = await (await adm('audit')).json();
  assert.ok(auditRows.some((a) => a.action === 'api_key.create'), 'audit log records API key creation');

  // --- rider refresher tracking: quiz results, HSSE stats, 3-month rider default ---
  assert.equal((await (await adm('assign', { employee_ids: [kePerson.id], module: 'gear' })).json()).assigned, 1);
  assert.equal((await (await adm('assign', { employee_ids: [kePerson.id], module: 'fire' })).json()).assigned, 1);
  const keA = (await overview())['Kenya Person'].assignments;
  assert.equal(keA.find((a) => a.module === 'gear').refresh_months, 3, 'rider refresher defaults to 3 months');
  assert.equal(keA.find((a) => a.module === 'fire').refresh_months, 6, 'work HSSE defaults to 6 months');
  const quiz = (code, data) => fetch(`${base}/api/quiz`, { method: 'POST', headers: { 'X-Staff-Code': code }, body: JSON.stringify(data) });
  assert.equal((await (await quiz(juma.code, { results: [{ module: 'check', step: 'check-q1', correct: false }, { module: 'check', step: 'check-q3', correct: true }] })).json()).recorded, 2);
  assert.equal((await quiz(juma.code, { results: [{ module: 'check', step: 'no-such-step', correct: true }] })).status, 400, 'unknown quiz step is rejected');
  const qstats = await (await adm('quiz-stats')).json();
  assert.ok(qstats.most_missed.some((r) => r.step === 'check-q1' && r.wrong >= 1), 'HSSE stats show the most-missed question');
  assert.ok((await (await adm('quiz-results.csv')).text()).includes('check-q1'), 'quiz results export to CSV for Excel');
  const quizKey = (await (await adm('api-keys', { name: 'quiz-erp', scopes: 'read,write,admin' })).json()).key;
  assert.equal((await v1(quizKey, 'quiz-results', { employee_id: ugId, module: 'fire', step: 'fire-q1', correct: true })).status, 201, 'ERP can post a quiz result');
  assert.ok((await (await v1(quizKey, 'quiz-results?module=fire')).json()).data.some((r) => r.step === 'fire-q1'), 'ERP can read quiz results');

  // --- automatic reminders + monthly scenario (no mail provider in test env) ---
  await as(hrTok, 'employees', { rows: [{ name: 'Kenya Person', external_system: 'erpnext', external_id: 'KE-001', email: 'ke@example.invalid' }] });
  await adm('assign', { employee_ids: [kePerson.id], module: 'lift', due_date: '2020-01-01' });
  const dry = await (await adm('reminders/run', { dry_run: true })).json();
  assert.ok(dry.items.some((x) => x.module === 'lift' && x.result === 'would_send'), 'dry run finds the overdue employee with email');
  const run1 = await (await adm('reminders/run', {})).json();
  assert.ok(run1.items.some((x) => x.module === 'lift' && x.result === 'no_provider'), 'without EMAIL_WEBHOOK_URL the reminder is logged as no_provider, not silently dropped');
  const run2 = await (await adm('reminders/run', {})).json();
  assert.ok(run2.items.some((x) => x.module === 'lift' && x.result === 'no_provider'), 'a failed/no-provider attempt does not block the next run (only a sent reminder dedupes)');
  const logs = await (await adm('reminders')).json();
  assert.ok(logs.some((r) => r.module === 'lift' && r.status === 'no_provider'));
  sql('delete from monthly_scenario;');
  const sc = await (await adm('scenario/run', {})).json();
  assert.equal(sc.scenario.module, 'check', 'monthly scenario comes from the most-missed question');
  assert.equal(sc.scenario.step, 'check-q1');
  assert.equal((await (await adm('scenario')).json()).step, 'check-q1', 'scenario is stable within the month');

  // --- round-table hardening: quiz retry idempotency, future dates, erasure, password reset ---
  const again2 = await (await quiz(juma.code, { results: [{ module: 'check', step: 'check-q1', correct: false }, { module: 'check', step: 'check-q3', correct: true }] })).json();
  assert.equal(again2.recorded, 2, 'new timestamps record (same answers, new events)');
  const retry = await (await quiz(juma.code, { results: [{ module: 'check', step: 'check-q1', correct: false, at: '2026-02-01T00:00:00.000Z' }, { module: 'check', step: 'check-q1', correct: false, at: '2026-02-01T00:00:00.000Z' }] })).json();
  assert.equal(retry.recorded, 1, 're-sending the same answer event is idempotent within a batch');
  assert.equal((await v1(quizKey, 'completions', { employee_id: ugId, module: 'fire', completed_at: '2099-01-01T00:00:00.000Z' })).status, 400, 'future ERP completion dates are rejected');
  await adm('users/password', { id: (await (await adm('users')).json()).find((u) => u.username === 'hr.one').id, password: 'hr-new-password-1' });
  assert.equal(await login('hr.one', 'hr-password-1').then((x) => !!x), false, 'old password stops working after reset (sessions revoked)');
  assert.ok(await login('hr.one', 'hr-new-password-1'), 'new password works after reset');
  const [gone] = await (await adm('employees', { rows: [{ name: 'Erase Me', external_system: 'manual', external_id: 'DEL-1' }] })).json();
  await adm('assign', { employee_ids: [gone.id], module: 'fire' });
  await adm('employees/delete', { id: gone.id });
  assert.equal((await overview())['Erase Me'], undefined, 'erasure removes the person and cascades their records');

  const vivaSelf = await fetch(`${base}/api/viva`, { method: 'POST', headers: { 'X-Staff-Code': juma.code }, body: JSON.stringify({ module: 'check', self: 'learning' }) });
  assert.equal((await vivaSelf.json()).status, 'self', 'voice self-mark is recorded without any Meta key');
  const vivaAudio = await fetch(`${base}/api/viva`, { method: 'POST', headers: { 'X-Staff-Code': juma.code }, body: JSON.stringify({ module: 'check', audio_b64: 'AAAA', secs: 5 }) });
  assert.equal(vivaAudio.status, 503, 'voice grading without a Meta key returns 503 so the phone keeps the recording queued');
  assert.equal((await (await adm('viva')).json())[0].self_mark, 'learning', 'HSSE can see voice results in the portal API');

  const aiDraft = await fetch(`${base}/admin/api/ai-scenario`, { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` }, body: JSON.stringify({ module: 'fire' }) });
  assert.equal(aiDraft.status, 503, 'Muse draft endpoint says so when no Meta API key is configured');
  assert.equal((await aiDraft.json()).code, 'no_meta_key');

  const page = await fetch(`${base}/admin`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /default-src 'none'/);
  for (const path of ['/', '/index.html', '/work.html?c=ABC'])
    assert.equal((await fetch(`${base}${path}`, { redirect: 'manual' })).status, 200, `${path} is served without a redirect`);
  let limited = false;
  for (let i = 0; i < 130 && !limited; i++) limited = (await me('WRONGCODE')).status === 429;
  assert.ok(limited, 'staff API is rate limited per client');
  console.log('ok: worker, D1, admin, staff API, refresh logic, rate limit, HR/HSSE roles, /api/v1 ERP API, API keys, webhooks, audit, reminders, monthly scenario');
} finally {
  process.kill(-dev.pid);
  rmSync(dir, { recursive: true, force: true });
}
