// Fails (exit 1) if the lessons, audio, offline cache list or manifest are inconsistent.  npm run check
import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { audioItems } from '../site/content.js';

const site = join(dirname(fileURLToPath(import.meta.url)), '..', 'site');
const read = (f) => readFile(join(site, f), 'utf8');
const exists = (f) => stat(join(site, f)).then(() => true, () => false);
const L = JSON.parse(await read('lessons.json'));
const errors = [];
const bad = (m) => errors.push(m);
const langs = Object.keys(L.langs);
// Same formula as scripts/make-audio.mjs.
const hashOf = (lang, text) => createHash('sha1').update(`${L.voices[lang]}\n${text}`).digest('hex');

for (const lang of langs) {
  if (!L.voices[lang]) bad(`no voice for ${lang}`);
  for (const k of Object.keys(L.ui.sw)) if (!L.ui[lang]?.[k]) bad(`ui.${lang}.${k} missing`);
}
for (const k of L.spoken) if (!L.ui.sw[k]) bad(`spoken key ${k} is not a ui string`);

const ids = new Set();
for (const m of L.modules) {
  if (!m.icon || langs.some((l) => !m.title[l])) bad(`module ${m.id}: icon or title missing`);
  for (const s of m.steps) {
    if (ids.has(s.id)) bad(`duplicate step id ${s.id}`);
    ids.add(s.id);
    if (!s.pic) bad(`${s.id}: no pic`);
    for (const l of langs) {
      if (!s.text?.[l]) bad(`${s.id}: text.${l} missing`);
      if (s.answer && !s.why?.[l]) bad(`${s.id}: why.${l} missing`);
    }
    if (s.answer && !['safe', 'danger'].includes(s.answer)) bad(`${s.id}: answer must be safe or danger`);
  }
}

const hashes = JSON.parse(await read('audio/hashes.json').catch(() => '{}'));
for (const a of audioItems(L)) {
  if (!(await exists(a.file))) bad(`missing audio ${a.file}`);
  else if (hashes[a.file] !== hashOf(a.lang, a.text)) bad(`stale audio ${a.file} (run npm run audio)`);
}

const shell = (await read('sw.js')).match(/SHELL = \[([^\]]*)\]/)?.[1].match(/'([^']+)'/g) ?? [];
for (const f of shell.map((s) => s.slice(1, -1)).filter((f) => f !== './')) if (!(await exists(f))) bad(`sw.js caches missing file ${f}`);
for (const i of JSON.parse(await read('manifest.webmanifest')).icons) if (!(await exists(i.src))) bad(`manifest icon ${i.src} missing`);

const sizeOf = async (d) => {
  let n = 0;
  for (const e of await readdir(d, { withFileTypes: true }))
    n += e.isDirectory() ? await sizeOf(join(d, e.name)) : (await stat(join(d, e.name))).size;
  return n;
};
const size = await sizeOf(site);
if (size > 5e6) bad(`site is ${(size / 1e6).toFixed(1)} MB, budget is 5 MB`);

if (errors.length) {
  console.error(errors.map((e) => `✗ ${e}`).join('\n'));
  process.exit(1);
}
console.log(`ok: ${ids.size} steps, ${audioItems(L).length} clips, ${(size / 1e6).toFixed(2)} MB`);
