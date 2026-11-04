# Privacy, retention and record integrity

For organisations running their own copy of Endesha Salama. This is an
operational summary, not legal advice; confirm duties under your country's
law (e.g. Tanzania PDPA 2022, Kenya DPA 2019) before a wider rollout.

## What is stored, and why
- Employee: name, ERP identity, optional email/department/site/company,
  country, language, and a hash of the learner's personal code. Used to assign
  training and show who is current, due soon or overdue.
- Training records: module completions and per-question answers, for
  employees who sign in with their code. Anonymous riders are never tracked.
- Operations: admin accounts and sessions, API keys (hashes only), webhooks
  and delivery receipts, reminder log, audit log.

## Record integrity
Completions and answers are **self-reported by the learner's phone** (the app
works offline and syncs later). Treat reports as self-reported training
records, not proctored exam evidence. The ERP API rejects future completion
dates; phones may report completions up to 90 days old to allow offline sync.

## Retention
- Admin sessions: deleted when expired (weekly cron) and on password reset.
- Webhook delivery receipts: deleted after 90 days (weekly cron).
- Training records, quiz answers, reminder and audit logs: kept while the
  person is employed; erase on request or on leaving (below). Review yearly
  whether older cycles are still needed.

## Erasure
An Admin can erase a person in /admin (Erase button). This deletes the
employee and, by cascade, their assignments, completions, quiz answers and
reminder history, and writes an audit entry. There is no undo. Deactivation
(softer) keeps records and only blocks sign-in.

## External services
No analytics. Staff names/codes are never sent to third parties by the
learner app. Two configured exceptions, both off until the owner enables them:
- Webhooks you register receive event payloads (employee id, module, dates).
- Reminder email posts the employee's name, email and due module to your
  configured EMAIL_WEBHOOK_URL (your mail relay, e.g. a Microsoft 365 Power
  Automate flow). Enabling it is the owner's decision that the relay is an
  approved processor for that data.
