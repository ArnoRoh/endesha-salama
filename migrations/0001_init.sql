-- HSSE platform schema for Cloudflare D1 (SQLite).  wrangler d1 migrations apply hsse --local|--remote
-- Times are ISO 8601 UTC text ('2026-10-09T08:00:00.000Z'), dates are 'YYYY-MM-DD' text: both sort and compare as text.
create table employee (
  id integer primary key,
  name text not null,                    -- Odoo hr.employee name
  odoo_login text unique,                -- Odoo res.users login
  odoo_employee_id integer unique,       -- Odoo hr.employee id
  email text,
  department text,
  site text,
  active integer not null default 1,
  code_hash text not null unique,        -- sha256 of the personal access code; the code itself is never stored
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  check (odoo_login is not null or odoo_employee_id is not null)
);
create table assignment (
  employee_id integer not null references employee on delete cascade,
  module text not null,
  due_date text,                         -- first-time deadline; later due dates come from the refresh interval
  refresh_months integer not null default 6 check (refresh_months > 0),
  assigned_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  primary key (employee_id, module)
);
create table completion (
  employee_id integer not null references employee on delete cascade,
  module text not null,
  completed_at text not null,
  primary key (employee_id, module, completed_at)
);
-- ponytail: SQLite month arithmetic rolls over (Jan 31 + 1 month = Mar 3) where Postgres clamps; a few days at most.
create view assignment_status as
select a.employee_id, a.module, a.due_date, a.refresh_months, c.last_completed,
  case when c.last_completed is null then a.due_date
       else date(c.last_completed, '+' || a.refresh_months || ' months') end as next_due,
  case when c.last_completed is null then (case when a.due_date < date('now') then 'overdue' else 'pending' end)
       when datetime(c.last_completed, '+' || a.refresh_months || ' months') < datetime('now') then 'overdue'
       when datetime(c.last_completed, '+' || a.refresh_months || ' months') < datetime('now', '+30 days') then 'due_soon'
       else 'current' end as status
from assignment a
left join (select employee_id, module, max(completed_at) as last_completed from completion group by employee_id, module) c
  on c.employee_id = a.employee_id and c.module = a.module;
