// One Ogg Opus clip (16 kbps mono, ~70% smaller than edge-tts's own 48 kbps MP3) per spoken line.
// Voices: Microsoft neural voices through edge-tts (needs internet), then re-encoded with ffmpeg + libopus.
// Re-run after editing lessons.json: only lines whose voice or text changed are regenerated.
//   pip install edge-tts imageio-ffmpeg   (or set EDGE_TTS=/path/to/edge-tts and FFMPEG=/path/to/ffmpeg)
//   npm run audio
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { audioItems } from '../site/content.js';

const run = promisify(execFile);
const site = join(dirname(fileURLToPath(import.meta.url)), '..', 'site');
const edge = process.env.EDGE_TTS ?? 'edge-tts';
const ffmpeg = process.env.FFMPEG ?? 'ffmpeg';
const raw = join(tmpdir(), `endesha-${process.pid}.mp3`);
const L = JSON.parse(await readFile(join(site, 'lessons.json'), 'utf8'));
const hashFile = join(site, 'audio', 'hashes.json');
const hashes = await readFile(hashFile, 'utf8').then(JSON.parse, () => ({}));
// Same formula as scripts/check.mjs.
const hashOf = (lang, text) => createHash('sha1').update(`${L.voices[lang]}\n${text}`).digest('hex');

let made = 0;
try {
  for (const a of audioItems(L)) {
    const hash = hashOf(a.lang, a.text);
    const out = join(site, a.file);
    if (hashes[a.file] === hash && (await readFile(out).then(() => true, () => false))) continue;
    await mkdir(dirname(out), { recursive: true });
    for (let attempt = 1; ; attempt++) {
      try {
        await run(edge, ['--voice', L.voices[a.lang], `--text=${a.text}`, '--write-media', raw]);
        await run(ffmpeg, ['-v', 'error', '-y', '-i', raw, '-ac', '1', '-c:a', 'libopus', '-b:a', a.name.includes('-viva') ? '12k' : '16k', '-application', 'voip', out]); // voice-answer clips are short prompts: 12k speech is enough and keeps the size budget
        break;
      } catch (err) {
        if (attempt === 3) throw new Error(`${a.file}: ${err.message}`);
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
    hashes[a.file] = hash;
    made++;
    console.log(`made ${a.file}`);
  }
} finally {
  await unlink(raw).catch(() => {});
  await mkdir(dirname(hashFile), { recursive: true });
  await writeFile(hashFile, JSON.stringify(hashes, null, 1) + '\n');
}
console.log(`${made} clip(s) generated`);
