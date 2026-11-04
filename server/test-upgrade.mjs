// Populated-upgrade regression test: a database that already holds training
// records at 0001 must keep them through every later migration, including the
// employee table rebuild in 0002 (DROP TABLE fires ON DELETE CASCADE when
// foreign keys are on). Run by `npm run test:server`. Uses node:sqlite only.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const files = readdirSync(new URL('../migrations/', import.meta.url)).filter((f) => f.endsWith('.sql')).sort();
const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
db.exec(readFileSync(new URL(`../migrations/${files[0]}`, import.meta.url), 'utf8'));
db.exec(`insert into employee(name, odoo_login, code_hash) values ('Upgrade Test', 'upgrade@example.invalid', 'hash');
  insert into assignment(employee_id, module, due_date) values (1, 'check', '2026-01-01');
  insert into completion(employee_id, module, completed_at) values (1, 'check', '2026-01-01T00:00:00.000Z');`);
for (const f of files.slice(1)) db.exec(readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8'));
const row = db.prepare(`select (select count(*) from employee) as e, (select count(*) from assignment) as a,
  (select count(*) from completion) as c, (select country from employee where id = 1) as country,
  (select language from employee where id = 1) as language`).get();
assert.deepEqual([row.e, row.a, row.c], [1, 1, 1], 'populated upgrade must preserve employee, assignment and completion');
assert.equal(row.country, 'TZ');
assert.equal(row.language, 'sw');
const tables = db.prepare("select name from sqlite_master where type = 'table'").all().map((r) => r.name);
for (const t of ['admin_user', 'api_key', 'webhook', 'quiz_result', 'reminder_log', 'monthly_scenario']) assert.ok(tables.includes(t), `${t} exists after upgrade`);
console.log('ok: populated 0001 database upgrades through all migrations with records intact');
