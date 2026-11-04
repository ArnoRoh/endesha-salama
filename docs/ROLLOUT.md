# Rollout: motorcycle refresher and HSSE training

How to introduce Endesha Salama to employees and keep the refresher running.
The system records completions and quiz answers only for employees who sign
in with their personal code. Anonymous riders are never tracked.

## Introduce it

1. Announce through Teams to all employees: what the refresher is, that it is
   in Kiswahili first (English switchable), works offline after the first
   visit, and takes a few minutes per module.
2. Share the link through Teams **and email**, and give it to supervisors so
   they can reach employees who have no Teams or no smartphone. Supervisors
   can open the lessons on a shared phone with the employee; the employee's
   own code keeps their record separate.
3. Add the refresher to onboarding for new riders: HR creates the employee
   (portal or `/api/v1`), HSSE assigns the six rider modules with a first
   deadline, and the personal link/code goes to the new rider on day one.

## Refresher schedule

- Rider refresher: **every 3 months** (the system default for rider modules).
  Work HSSE modules: every 6 months, unless HSSE set another interval.
- **Monthly safety scenario (automatic):** on the 1st, the system picks the
  most-missed question from real quiz answers (rotating through the question
  pool until answers exist), stores it for the month, emails it to active
  employees, and shows it to every signed-in learner on their home screen.
  HSSE can regenerate/distribute it any time from the admin portal.
- Reminders are **automatic**: a weekly cron (Mon 06:00 UTC, `wrangler.jsonc`)
  reminds everyone `overdue` or `due_soon`, never twice within 14 days, and
  the monthly cron generates and distributes the safety scenario. HSSE can run
  both any time from the admin portal (Reminders section, with a dry-run
  preview). Every due reminder is logged — sent, failed, no email address, or
  **no_provider**.
- Mail provider (one configuration step): the system sends by POSTing
  `{to, subject, text}` JSON to the URL in the `EMAIL_WEBHOOK_URL` secret
  (plus `EMAIL_API_KEY` as Bearer when your endpoint needs one). Point it at a
  Microsoft 365 Power Automate / Logic Apps "send email" HTTP trigger, or any
  mail relay your organisation approves, e.g.
  `npx wrangler secret put EMAIL_WEBHOOK_URL` for Cloudflare, or add it to
  `~/.config/endesha-salama/env` for the tailnet preview. Until that is set,
  reminders stay `no_provider` in the log: nobody is silently missed, but no
  email leaves the system. On this VPS there is no other sending path: the
  host mailer is local-only and the Microsoft Graph tool is read-only.

## Identification (optional)

Riders may type name, employee ID, department and company on the certificate
screen. All four are optional, stay on the phone, and print on the
certificate. They are uploaded only when the employee has signed in with
their code, which is itself optional.

## Six-month HSSE review

After six months, HSSE reviews, from the admin portal (Quiz results section)
and the CSV exports (both open in Excel):

1. Percentage of riders who completed the refresher (overview + report.csv:
   current vs assigned).
2. The questions riders answer incorrectly most often (most-missed list).
3. Whether modules need improvement, and whether the 3-month interval should
   change (per-assignment `refresh_months` in the portal or API).

Use quiz results plus relevant incidents to find knowledge gaps and plan
extra training (toolbox talks, supervised practice) for those topics.
