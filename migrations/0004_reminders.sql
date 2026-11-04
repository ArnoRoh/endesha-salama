-- Automatic refresher reminders and the monthly safety scenario.
-- A reminder is logged for every employee who becomes due, even when no mail
-- provider is configured yet (status 'no_provider'): HSSE can always see who
-- was due, and delivery starts as soon as EMAIL_WEBHOOK_URL is configured.
create table reminder_log (
  id integer primary key,
  employee_id integer not null references employee on delete cascade,
  module text not null,
  kind text not null check (kind in ('due_soon', 'pending', 'overdue', 'scenario')),
  channel text not null default 'email',
  status text not null check (status in ('sent', 'failed', 'no_email', 'no_provider')),
  detail text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index reminder_log_employee on reminder_log (employee_id, module, kind, created_at);

create table monthly_scenario (
  month text primary key, -- YYYY-MM
  module text not null,
  step text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
