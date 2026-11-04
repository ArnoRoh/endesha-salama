# Hackathon submission — copy into the Cerebral Valley portal

**Project:** Endesha Salama ("Drive Safe") — Kiswahili-first safety training for East African riders and workers
**Track:** Indie developer · **Theme:** Build for Your World
**Demo (live, no login):** https://arnoroh.github.io/endesha-salama/
**Code:** https://github.com/ArnoRoh/endesha-salama
**Demo video (2:23):** https://github.com/ArnoRoh/endesha-salama/blob/main/docs/demo-video.mp4

## One line
Free, offline, Kiswahili-first safety lessons with audio and pictures for the
motorcycle riders and factory workers East Africa actually has — plus the
staff-tracking platform behind it: assignments, refresher due dates, quiz
analytics, automatic reminders, and an API any ERP/HRM can plug into.

## The problem
Tanzania recorded 287 motorcycle deaths and 311 injuries in 2025 (police
statistics), and the WHO estimates 10,052 road deaths a year nationally.
Workplace HSSE training is usually English-first, classroom-bound, and
impossible to track for staff who share phones, work offline, or have low
literacy. Our own incident records (a factory HSSE review and monthly safety
meetings) showed the same gaps repeating: ladders, gas cylinders, lifting,
PPE, unreported near misses.

## What we built (in the build window)
- **Learner app:** 125 micro-lessons in Kiswahili (default) and English, every
  line spoken aloud (392 audio clips), 107 purpose-generated pictures, works
  fully offline after first visit, certificates, sequential refresher
  unlocking, 3-month rider refresher cycle. Opening hook lines make
  experienced riders stop and think ("A motorcycle can look fine and still be
  unsafe").
- **Staff platform:** one Cloudflare Worker + D1. HR imports people (CSV from
  any ERP, or one-by-one with just a name — no ERP required), HSSE assigns
  modules with deadlines, and the system tracks who is current, due soon or
  overdue. Per-question quiz results feed a most-missed-questions view for
  the six-month HSSE review. Weekly automatic email reminders (14-day
  dedupe), monthly safety scenarios, HR/HSSE/Admin roles, audit log.
- **ERP/HRM API:** versioned `/api/v1` with scoped API keys and signed
  webhooks, so Odoo, ERPNext or an in-house HR system can sync people,
  assignments, completions and quiz results. OpenAPI contract included.
- **Quality gates:** the whole content set survived an adversarial review —
  wrong answer keys (none), a longest-answer gaming cue (found in 26/30
  questions, fixed to chance level), unsafe advice (a lockable first-aid box,
  forklift/pallet-jack confusion — fixed) — and a two-model round table
  (Opus + Astra) whose security findings were then built: shared-phone result
  isolation, PBKDF2 admin passwords, login throttling, idempotent offline
  queues, a populated-database migration test.

## How Meta AI is used
The platform was designed and built with **Muse Code** (Meta's agentic
coding tool, running Muse models) as the primary builder, with other frontier
models used adversarially: content review, a security round table, and image
generation critique. In the product, HSSE staff can draft new monthly safety
scenarios with **Muse Spark** (Meta Model API, `muse-spark-1.3`): it writes a
bilingual Kiswahili/English scenario from the topic learners miss most, and a
human must review it before any learner sees it. (Live in the admin portal
when a Model API key is configured; the endpoint is in the repo and covered
by tests.)

## Why it can grow
Open source (MIT code, CC BY 4.0 content) so any school, SACCO, factory or
county in East Africa can run its own copy: one Cloudflare account, one
database, country and language fields from day one. Next steps are human
HSSE and native-Kiswahili review per country, country emergency-number packs,
and replacing machine voices with recorded ones.

## Honest limits
No human HSSE professional or native Kiswahili speaker has reviewed the
lessons yet — the app says so on screen. Lesson references are
Tanzania-specific. The demo link above is the learner app; the staff/admin
side runs on a private preview (shown in the video) because it holds personal
data.
