# Endesha Salama — Usalama wa Pikipiki

Free motorcycle safety lessons in **Kiswahili and English**, built for riders who do not read much.
Every screen has one picture, one short sentence, a 🔊 button that reads it aloud, and big buttons.
It works offline after the first visit, collects no personal data, and has no accounts.

Brought to you by [Masika Ventures](https://masika.ventures).

> **Disclaimer.** This is general safety education. It does not replace formal rider training,
> a valid licence, or the traffic laws of your country. The text and voices were made with the help of
> AI and have **not** been reviewed by a road-safety authority.

## Lessons

| Module | Topic |
|---|---|
| 🔧 Before You Ride | tyres, brakes, lights, chain, fuel |
| ⛑️ Protective Gear | helmet and strap, vest, gloves, shoes |
| 🛣️ On the Road | speed, gaps, rain and mud, night, overtaking, junctions |
| 🧍 Passengers and Loads | one passenger, passenger helmet, safe loads |
| 🚫 Alcohol, Phones and Tiredness | the three habits that cause crashes |
| 🚑 If a Crash Happens | stay safe, call 112, do not remove a helmet, stop bleeding |

When a rider finishes everything they can write their name and share a picture certificate with the
phone's own share menu (WhatsApp, etc.). The certificate is drawn on the phone and never uploaded.

## Run it

There is no build step. The website is the `site/` folder.

```sh
npm run serve        # http://localhost:8080  (needs python3)
npm run check        # lessons, audio, offline list and 5 MB size budget
```

## Change or add a lesson

Everything the learner sees and hears is in `site/lessons.json`:

- `ui` — interface words, per language.
- `modules[].steps[]` — `id`, `pic` (emoji for now; replace with images later), `text` per language.
  A step with `answer` (`safe` or `danger`) is a question and needs `why` per language.

Then regenerate the voices and check:

```sh
pip install edge-tts          # or: EDGE_TTS=/path/to/edge-tts
npm run audio                 # only lines that changed are regenerated
npm run check
```

### Add a language

1. Add it to `langs` and `voices` in `lessons.json` (list voices with `edge-tts --list-voices`).
2. Add every `ui` string and every step `text` / `why` in that language.
3. `npm run audio && npm run check`. The check tells you what is missing.

## Put it online (Cloudflare Pages)

The site is static, so Cloudflare serves it for free.

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Choose this repository.
3. **Build command:** leave empty. **Build output directory:** `site`.
4. Save and deploy. Every push to `main` redeploys. Add a custom domain under **Custom domains**.

Or without Git: `npx wrangler pages deploy site --project-name endesha-salama` (needs `wrangler login`).
The Cloudflare dashboard changes now and then; if a menu differs, the settings above are what matters.

## Licences

- **Code** (`site/*.js`, `site/*.html`, `site/*.css`, `scripts/`): [MIT](LICENSE).
- **Content** (lessons, text, pictures, icons, certificate design): [CC BY 4.0](LICENSE-CONTENT).
  Credit "Masika Ventures — Endesha Salama" and link to this repository.
- **Audio** (`site/audio/`): machine-generated with Microsoft neural voices through the
  [edge-tts](https://github.com/rany2/edge-tts) tool. These are placeholders. Microsoft's terms for
  redistributing this audio are not clear, so do not rely on it for commercial reuse. Replace it with human
  recordings or a licensed speech service (e.g. Azure Speech) before wider reuse, then re-run `npm run check`.
