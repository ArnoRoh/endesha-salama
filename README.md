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
npm run serve        # http://localhost:8080
npm run check        # lessons, audio, offline list and 5 MB size budget
```

### Test on a phone over Tailscale (private)

Offline mode and the share button only work over HTTPS, so plain `http://<tailscale-ip>` is not enough.
`scripts/endesha-salama.service` runs the server on loopback, and Tailscale Serve adds tailnet-only HTTPS.
Install steps are in the header of that file. On the VPS this is live at
`https://inmotion-vps.tail09dd9a.ts.net:4520/`. Never add `--funnel`: that would make it public.
After a lesson edit, reload twice: the offline cache shows the old copy once, then updates.

## Change or add a lesson

Everything the learner sees and hears is in `site/lessons.json`:

- `ui` — interface words, per language.
- `modules[].steps[]` — `id`, `pic` (emoji for now; replace with images later), `text` per language.
  A step with `answer` (`safe` or `danger`) is a question and needs `why` per language.

Then regenerate the voices and check:

```sh
pip install edge-tts imageio-ffmpeg    # imageio-ffmpeg bundles an ffmpeg that can write Opus
export EDGE_TTS=/path/to/edge-tts      # only if edge-tts is not on PATH
export FFMPEG=$(python3 -c 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())')   # or any ffmpeg with libopus
npm run audio                 # only lines that changed are regenerated
npm run check
```

**Sound size.** Clips are Ogg Opus, 16 kbps mono: about 0.55 MB per language, so a first visit is about
0.7 MB (the same clips as 48 kbps MP3 were 2 MB). Opus plays on Android, Chrome and Firefox. Older iPhones
and Safari versions may not play it (not tested); if that matters, switch `scripts/make-audio.mjs` to
`libmp3lame` at 24 kbps and the `.ogg` names in `site/content.js` and `scripts/serve.mjs` to `.mp3`.
Changing the bitrate there and re-running `npm run audio` after deleting `site/audio/*/` re-encodes everything.

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

## Content review status

- 2026-10-01: a second AI (OpenAI GPT-6.1-Sol, via Codex) reviewed all lessons for road-safety accuracy,
  Kiswahili and English wording, and how the lines sound read aloud. No answer key was wrong. Its must-fix
  items (crash advice, emergency number, disclaimer) and most should-fix items are applied.
- **No human road-safety or first-aid expert has reviewed this.** Please do so before promoting it widely,
  and send corrections as issues or pull requests.
- The emergency numbers in the crash lesson (112 and 999) come from secondary sources, not the national
  authorities, and are not confirmed for eastern DRC. The lesson says "your country's emergency number".
  Spoken digits are written with spaces (`1 1 2`) because the voice reads `112` as one hundred and twelve.

## Licences

- **Code** (`site/*.js`, `site/*.html`, `site/*.css`, `scripts/`): [MIT](LICENSE).
- **Content** (lessons, text, pictures, icons, certificate design): [CC BY 4.0](LICENSE-CONTENT).
  Credit "Masika Ventures — Endesha Salama" and link to this repository.
- **Audio** (`site/audio/`): machine-generated with Microsoft neural voices through the
  [edge-tts](https://github.com/rany2/edge-tts) tool. These are placeholders. Microsoft's terms for
  redistributing this audio are not clear, so do not rely on it for commercial reuse. Replace it with human
  recordings or a licensed speech service (e.g. Azure Speech) before wider reuse, then re-run `npm run check`.
