-- Rider refresher tracking: per-question quiz results for HSSE review, and a
-- company field so any organisation can record which company a learner
-- belongs to (identification stays optional in the learner app).
alter table employee add column company text;

create table quiz_result (
  id integer primary key,
  employee_id integer not null references employee on delete cascade,
  module text not null,
  step text not null,
  correct integer not null check (correct in (0, 1)),
  answered_at text not null,
  source text not null default 'staff' check (source in ('staff', 'api'))
);
create index quiz_result_employee on quiz_result (employee_id, module);
create index quiz_result_step on quiz_result (step);
