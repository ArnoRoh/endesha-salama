// Fails (exit 1) if the lessons, audio, offline cache list or manifest are inconsistent.  npm run check
import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { audioItems } from '../site/content.js';
import { ART, ART_FILES } from '../site/art.js';

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
  if (m.track === 'work') {
    if (!Array.isArray(m.submodules) || m.submodules.length < 4 || m.submodules.length > 6) bad(`${m.id}: 4 to 6 submodules required`);
    else {
      const unitIds = new Set();
      for (const unit of m.submodules) {
        if (!unit.id || unitIds.has(unit.id)) bad(`${m.id}: missing or duplicate submodule id`);
        unitIds.add(unit.id);
        if (langs.some((l) => !unit.title?.[l])) bad(`${m.id}/${unit.id}: title missing`);
        if (!Array.isArray(unit.steps) || !unit.steps.length) bad(`${m.id}/${unit.id}: no steps`);
      }
      const covered = m.submodules.flatMap((unit) => unit.steps ?? []);
      if (covered.length !== m.steps.length || new Set(covered).size !== m.steps.length || m.steps.some((s) => !covered.includes(s.id)))
        bad(`${m.id}: submodules must cover each lesson and quiz step exactly once`);
    }
  }
  for (const s of m.steps) {
    if (ids.has(s.id)) bad(`duplicate step id ${s.id}`);
    ids.add(s.id);
    if (!s.pic) bad(`${s.id}: no pic`);
    if ('art' in s && !Object.hasOwn(ART, s.art)) bad(`${s.id}: unknown art ${s.art}`);
    for (const l of langs) {
      if (!s.text?.[l]) bad(`${s.id}: text.${l} missing`);
      if (s.answer && !s.why?.[l]) bad(`${s.id}: why.${l} missing`);
    }
    if (s.options) {
      if (!Array.isArray(s.options) || s.options.length !== 3) bad(`${s.id}: exactly three options required`);
      else {
        if (s.options.map((o) => o.id).join(',') !== 'a,b,c') bad(`${s.id}: option ids must be a,b,c`);
        for (const o of s.options)
          for (const l of langs) if (!o.text?.[l]?.trim()) bad(`${s.id}/${o.id}: text.${l} missing`);
        if (!s.options.some((o) => o.id === s.answer)) bad(`${s.id}: answer must name an option`);
      }
    } else if (s.answer && !['safe', 'danger'].includes(s.answer)) bad(`${s.id}: answer must be safe or danger`);
    if (s.source && (!s.source.label || !/^https:\/\//.test(s.source.url))) bad(`${s.id}: source label and HTTPS link required`);
  }
}

const hashes = JSON.parse(await read('audio/hashes.json').catch(() => '{}'));
for (const a of audioItems(L)) {
  if (!(await exists(a.file))) bad(`missing audio ${a.file}`);
  else if (hashes[a.file] !== hashOf(a.lang, a.text)) bad(`stale audio ${a.file} (run npm run audio)`);
}

const shell = (await read('sw.js')).match(/SHELL = \[([^\]]*)\]/)?.[1].match(/'([^']+)'/g) ?? [];
const shellFiles = shell.map((s) => s.slice(1, -1));
for (const f of shellFiles.filter((f) => f !== './')) if (!(await exists(f))) bad(`sw.js caches missing file ${f}`);
for (const i of JSON.parse(await read('manifest.webmanifest')).icons) if (!(await exists(i.src))) bad(`manifest icon ${i.src} missing`);

const sizeOf = async (d) => {
  let n = 0;
  for (const e of await readdir(d, { withFileTypes: true }))
    n += e.isDirectory() ? await sizeOf(join(d, e.name)) : (await stat(join(d, e.name))).size;
  return n;
};
const artSize = (await stat(join(site, 'art.js'))).size;
if (artSize > 120e3) bad(`art.js is ${artSize} bytes, budget is 120 KB`);
for (const f of ART_FILES) {
  if (!shellFiles.includes(f)) bad(`${f}: picture missing from offline SHELL`);
  if (!(await exists(f))) { bad(`missing picture ${f}`); continue; }
  const bytes = await readFile(join(site, f));
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') bad(`${f}: not a WebP image`);
  else { // approved art standard: exactly 480x400 (AGENTS.md); generation output must be resized/cropped to this before commit
    const kind = bytes.toString('ascii', 12, 16);
    const dims = kind === 'VP8X' ? [bytes.readUIntLE(24, 3) + 1, bytes.readUIntLE(27, 3) + 1]
      : kind === 'VP8L' ? [(bytes.readUInt32LE(21) & 0x3fff) + 1, ((bytes.readUInt32LE(21) >> 14) & 0x3fff) + 1]
      : kind === 'VP8 ' ? [bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff] : [0, 0];
    if (dims[0] !== 480 || dims[1] !== 400) bad(`${f}: picture is ${dims[0]}x${dims[1]}, must be 480x400`);
  }
  if (bytes.length > 40e3) bad(`${f}: picture exceeds 40 KB`);
}
const size = await sizeOf(site);
const budget = (5e6 / 6) * L.modules.length; // per module: the original 5 MB for 6 modules; audio loads per module, not at first visit
if (size > budget) bad(`site is ${(size / 1e6).toFixed(2)} MB, budget is ${(budget / 1e6).toFixed(2)} MB (${L.modules.length} modules)`);

if (errors.length) {
  console.error(errors.map((e) => `✗ ${e}`).join('\n'));
  process.exit(1);
}
console.log(`ok: ${ids.size} steps, ${audioItems(L).length} clips, ${(size / 1e6).toFixed(2)} MB`);
