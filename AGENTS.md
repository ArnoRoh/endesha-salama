# AGENTS.md — endesha-salama

Free motorcycle safety lessons (Kiswahili and English) for Masika Ventures staff
and riders. Static offline web app; `README.md` has the full lesson, art, audio
and deployment procedures. Read it before you change content.

## Rules

- No build step. The site is `site/`. Lesson text and questions are in
  `site/lessons.json`.
- Run `npm run check` before you commit. It checks lessons, audio, the offline
  list and the size budget (5 MB per 6 modules).
- After a change to site files, bump `CACHE` in `site/sw.js`. Add new pictures
  to `SHELL` in the same file. The service worker shares a public origin with
  other apps: never delete caches that this app does not own.
- After a lesson text change, run `npm run audio`, then `npm run check`.
- Pictures: 480 × 400 WebP, 40 KB maximum, approved comic ink style. Keep
  question pictures free of answer symbols.
- The live preview is tailnet-only through `endesha-salama.service` and
  Tailscale Serve. Never add `--funnel` and never deploy to Cloudflare
  (`npm run deploy`, `wrangler deploy`) without Arno's approval.
- No human road-safety or first-aid expert has reviewed the content. Do not
  remove the disclaimer or describe the content as reviewed.

## HSSE staff platform

- Work modules have `"track": "work"` and show only in `site/work.html`. Rider modules show only in `index.html`. Keep the two tracks apart.
- `server/` is a Cloudflare Worker (staff API and admin portal) with a D1 database; schema changes are new files in `migrations/`. Run `npm run test:server` after a change there.
- Secrets are in `~/.config/endesha-salama/env` and Cloudflare Worker secrets. Never commit them and never print `ADMIN_TOKEN`.
- `/admin` has employee records. On Cloudflare it must be behind Cloudflare Access. Never put the preview (port 4521) behind `--funnel`; `tailscale serve` for 4521 is tailnet-only.
- Staff data is personal data. Do not add analytics. Do not send the staff code or names to any external service.
- Odoo is linked by `odoo_login` or `odoo_employee_id` only. Production Odoo is read-only unless `MV_odoo_infra` approvals say otherwise.
- Work pictures are painted from the prompts in `scripts/art-prompts.json`. After a picture change, run `npm run check`.
