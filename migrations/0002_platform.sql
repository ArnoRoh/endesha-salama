-- Rebuild safety: with foreign keys ON, dropping a parent table fires ON DELETE
-- CASCADE and would delete assignment/completion history. Disable FK checks for
-- this rebuild (SQLite 12-step table rebuild); ids are copied unchanged.
pragma foreign_keys=off;

-- Platform build-out: East African country/language, generic ERP identity,
-- individual admin accounts with roles, API keys, webhooks and audit log.
-- Open-source deployments are single-organisation per D1 database; run one
-- deployment per organisation. Country defaults to TZ and language to sw
-- (Kiswahili first) for rows created before this migration.

-- employee: add country/language/external identity and relax the identity
-- check so any ERP/HRM can key a person by (external_system, external_id),
-- not only Odoo. SQLite cannot alter a CHECK, so rebuild the table.
create table employee_new (
  id integer primary key,
  name text not null,
  odoo_login text unique,
  odoo_employee_id integer unique,
  external_system text,
  external_id text,
  email text,
  department text,
  site text,
  country text not null default 'TZ' check (length(country) = 2),
  language text not null default 'sw' check (language in ('sw', 'en')),
  active integer not null default 1,
  code_hash text not null unique,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  unique (external_system, external_id),
  check (odoo_login is not null or odoo_employee_id is not null or external_id is not null)
);
insert into employee_new (id, name, odoo_login, odoo_employee_id, email, department, site, active, code_hash, created_at)
  select id, name, odoo_login, odoo_employee_id, email, department, site, active, code_hash, created_at from employee;
drop table employee;
alter table employee_new rename to employee;
create index employee_country on employee (country);
create index employee_department on employee (department);

alter table completion add column source text not null default 'staff' check (source in ('staff', 'api', 'admin'));

create table admin_user (
  id integer primary key,
  username text not null unique,
  password_hash text not null, -- salt$sha256(salt:password); see server/index.mjs hashPassword()
  role text not null check (role in ('hr', 'hsse', 'admin')),
  active integer not null default 1,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create table admin_session (
  token_hash text primary key,
  admin_user_id integer not null references admin_user on delete cascade,
  expires_at text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index admin_session_user on admin_session (admin_user_id);

create table api_key (
  id integer primary key,
  name text not null,
  key_hash text not null unique, -- sha256 of the full key; the key is shown once
  scopes text not null default 'read', -- comma list: read, write, admin
  created_by text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_used_at text,
  revoked integer not null default 0
);

create table webhook (
  id integer primary key,
  url text not null,
  secret text not null, -- HMAC signing secret, shown once at creation; needed to sign deliveries
  events text not null default 'completion.created', -- comma list
  active integer not null default 1,
  created_by text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create table webhook_delivery (
  id integer primary key,
  webhook_id integer not null references webhook on delete cascade,
  event text not null,
  payload text not null,
  status text not null default 'pending' check (status in ('pending', 'delivered', 'failed')),
  response_code integer,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index webhook_delivery_webhook on webhook_delivery (webhook_id, created_at);

create table audit_log (
  id integer primary key,
  actor_type text not null, -- token | admin_user | api_key | staff
  actor text not null,
  action text not null,
  entity text,
  entity_id text,
  detail text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index audit_log_created on audit_log (created_at);

pragma foreign_keys=on;
