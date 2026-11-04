// Exercise the real quiz renderer and answer feedback without browser dependencies.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createContext, runInContext } from 'node:vm';
import { audioItems, audioPath } from '../site/content.js';

const L = JSON.parse(await readFile(new URL('../site/lessons.json', import.meta.url), 'utf8'));
const source = await readFile(new URL('../site/app.js', import.meta.url), 'utf8');
const quiz = source.slice(source.indexOf('function step('), source.indexOf('function finish('));
const clips = audioItems(L);
let cases = 0;
for (const lang of Object.keys(L.langs)) {
  let feedback, result, spoken, focused;
  const app = { innerHTML: '', querySelector: (selector) => selector === '.answers'
    ? { set outerHTML(html) { feedback = html; } }
    : { focus() { focused = true; } } };
  const context = createContext({ L, ART: {}, app, pos: [0, 0],
    currentUnit: null, unitSteps: (m) => m.steps, code: () => null, localStorage: {},
    t: (text) => text[lang], u: (key) => L.ui[lang][key],
    icon: () => '', speaker: () => '', say: (name) => { spoken = name; },
    beep: (ok) => { result = ok; }, setTimeout: (fn) => fn(), scrollTo() {} });
  runInContext(quiz, context);
  for (const [mi, m] of L.modules.entries()) for (const [si, s] of m.steps.entries()) {
    if (!s.answer) continue;
    const options = s.options ?? [{ id: 'safe' }, { id: 'danger' }];
    for (const option of options) {
      focused = false;
      context.step(mi, si);
      assert.equal(spoken, s.id);
      assert.equal((app.innerHTML.match(/data-answer=/g) ?? []).length, options.length);
      for (const o of s.options ?? []) {
        assert.ok(app.innerHTML.includes(o.text[lang]));
        assert.ok(clips.find((a) => a.lang === lang && a.name === s.id).text.includes(o.text[lang]));
      }
      if (s.source) assert.ok(app.innerHTML.includes(s.source.url));
      context.answer(option.id);
      assert.equal(result, option.id === s.answer, `${lang}/${s.id}/${option.id}`);
      assert.ok(feedback.includes(L.ui[lang][result ? 'correct' : 'wrong']));
      assert.ok(feedback.includes(s.why[lang]));
      const correct = s.options?.find((o) => o.id === s.answer);
      if (correct) {
        assert.ok(feedback.includes(correct.text[lang]));
        assert.ok(clips.find((a) => a.lang === lang && a.name === `${s.id}-why`).text.includes(correct.text[lang]));
      }
      assert.equal(spoken, `${s.id}-why`);
      assert.ok(focused);
      cases++;
    }
  }
}
console.log(`ok: ${cases} quiz choices, feedback and spoken options in both languages`);

// Download boundaries: no course audio at startup or language selection; one module on entry.
let click, controlReady;
const fetched = [], storage = {};
const worker = { controller: null, register() {}, addEventListener(event, fn) { assert.equal(event, 'controllerchange'); controlReady = fn; } };
const loading = createContext({ L, audioItems, localStorage: storage,
  currentUnit: null, topic: null,
  lang: () => storage.lang ?? 'sw', document: { documentElement: {} },
  navigator: { serviceWorker: worker }, home() {}, say() {}, step() {}, hook() {}, isLocked: () => false, startStaff() {}, sync() {}, ui: (k) => `ui-${k}`,
  fetch: (file) => { fetched.push(file); return Promise.resolve(); },
  app: { addEventListener(event, fn) { click = fn; } } });
runInContext(source.slice(source.indexOf('async function prefetch(')), loading);
const press = (dataset) => click({ target: { closest: () => ({ dataset }) } });
assert.deepEqual(fetched, []);
press({ mod: '0' });
assert.deepEqual(fetched, [], 'wait for service worker control before warming audio');
worker.controller = {};
controlReady();
await new Promise(setImmediate);
assert.ok(fetched.length > 0);
for (const lang of Object.keys(L.langs)) for (const [mi, m] of L.modules.entries()) {
  fetched.length = 0;
  press({ lang });
  assert.deepEqual(fetched, [], 'language selection must not download the course');
  press({ mod: String(mi) });
  const names = [...L.spoken.map((k) => `ui-${k}`), ...(m.hook ? [`${m.id}-hook`] : []), ...m.steps.flatMap((s) => s.why ? [s.id, `${s.id}-why`] : [s.id])];
  assert.deepEqual(new Set(fetched), new Set(names.map((name) => audioPath(lang, name))));
}
console.log('ok: audio downloads only on module entry, in the selected language, after service worker control');

// Exercise the shared entry page and real submodule completion flow, including old progress and staff refreshes.
const appSource = source.slice(source.indexOf('// Both entry pages')).replace(/^const L = await fetch.*\n/m, '');
function screen(track, search = '', saved = {}) {
  const storage = { lang: 'en', ...saved, removeItem(k) { delete this[k]; } };
  const handlers = {};
  const app = { innerHTML: '', addEventListener(event, fn) { handlers[event] = fn; }, querySelector(selector) {
    if (selector === '.grid') return this.innerHTML.includes('class="grid"') ? {} : null;
    if (selector === '.answers') return { set outerHTML(value) { app.feedback = value; } };
    return { focus() {} };
  } };
  const location = { search, pathname: track === 'work' ? '/work.html' : '/index.html', href: '' };
  const context = createContext({ L, ART: {}, app, localStorage: storage, location, URLSearchParams,
    audioItems, audioPath, Audio: class { play() { return Promise.resolve(); } pause() {} },
    document: { documentElement: { dataset: { track } }, getElementById: () => app, createElement: () => ({}) },
    window: { addEventListener() {} }, navigator: { serviceWorker: { controller: {}, register() {} } },
    fetch: () => Promise.reject(new Error('offline')), scrollTo() {}, setTimeout: (fn) => fn(),
  });
  runInContext(appSource, context);
  runInContext('beep = () => {}', context);
  const press = (dataset) => handlers.click({ target: { closest: () => ({ dataset }) } });
  return { context, storage, app, location, press };
}
for (const track of ['ride', 'work']) {
  const s = screen(track);
  assert.equal((s.app.innerHTML.match(/data-topic=/g) ?? []).length, 1 + L.modules.filter((m) => m.track === 'work').length);
  for (const id of ['ride', ...L.modules.filter((m) => m.track === 'work').map((m) => m.id)]) {
    s.press({ topic: id });
    assert.equal(s.location.href, `${id === 'ride' ? 'index.html' : 'work.html'}?topic=${id}`);
  }
  s.press({ lang: 'sw' });
  assert.ok(s.app.innerHTML.includes(L.ui.sw.motorcycle));
  assert.ok(s.app.innerHTML.includes(L.ui.sw[track === 'work' ? 'work_disclaimer' : 'disclaimer']));
}
const rider = screen('ride', '?topic=ride');
assert.equal((rider.app.innerHTML.match(/data-mod=/g) ?? []).length, 6);
assert.ok(!rider.app.innerHTML.includes('data-unit='));
assert.ok(rider.app.innerHTML.includes('data-form="signin"'), 'rider screen offers the optional employee sign-in');
assert.ok(rider.app.innerHTML.includes(L.ui.en.riderTrack));
assert.ok(rider.app.innerHTML.includes('data-mod="1" disabled'), 'second rider module is locked before the first is done');
rider.press({ mod: '0' });
assert.ok(rider.app.innerHTML.includes(L.modules[0].hook.en), 'module opens with its hook line');
rider.press({ hookstart: '0' });
assert.ok(rider.app.innerHTML.includes(L.modules[0].steps[0].text.en), 'hook leads into the first step');
for (const [mi, m] of L.modules.entries()) {
  if (m.track !== 'work') continue;
  const s = screen('work', `?topic=${m.id}`);
  assert.equal((s.app.innerHTML.match(/data-unit=/g) ?? []).length, m.submodules.length);
  assert.ok(!s.app.innerHTML.includes('data-mod='));
  for (const [ui, unit] of m.submodules.entries()) {
    s.press({ unit: `${mi}:${ui}` });
    for (const id of unit.steps) {
      const step = m.steps.find((p) => p.id === id);
      assert.ok(s.app.innerHTML.includes(step.text.en), `${m.id}/${unit.id}: selected step`);
      if (step.answer) s.press({ answer: step.answer });
      s.press({ go: 'next' });
    }
    const complete = JSON.parse(s.storage.done || '[]');
    assert.equal(complete.includes(m.id), ui === m.submodules.length - 1, 'parent completes only after every submodule');
    assert.equal(complete.some((id) => L.modules.find((p) => p.id === id)?.track !== 'work'), false);
  }
  const old = screen('work', `?topic=${m.id}`, { done: JSON.stringify([m.id]) });
  assert.equal((old.app.innerHTML.match(/card done/g) ?? []).length, m.submodules.length, 'carry over old parent completion');
}
const fire = L.modules.find((m) => m.id === 'fire');
const staff = { name: 'Test', assignments: [{ module: 'fire', status: 'overdue', next_due: '2026-10-01' }] };
const refresh = screen('work', '?topic=fire', { staff: JSON.stringify(staff), staffCode: 'TESTONLY', done: '["fire"]',
  submodulesDone: JSON.stringify(fire.submodules.map((s) => `TESTONLY/fire/${s.id}/2026-04-01`)) });
assert.equal((refresh.app.innerHTML.match(/card done/g) ?? []).length, 0, 'overdue staff training does not inherit a previous cycle');
console.log(`ok: shared topics, track separation, all ${L.modules.filter((m) => m.track === 'work').reduce((n, m) => n + m.submodules.length, 0)} work submodules, parent completion, old progress and staff refresh`);
