import { audioItems, audioPath } from './content.js';
import { ART } from './art.js';

// Both entry pages show the shared topic list. Lessons and staff requests keep their own track.
const TRACK = document.documentElement.dataset.track ?? 'ride';
const L = await fetch('lessons.json').then((r) => r.json());
const app = document.getElementById('app');
const lang = () => (localStorage.lang in L.langs ? localStorage.lang : 'sw');
const t = (o) => o[lang()] ?? o.sw;
const u = (k) => L.ui[lang()][`${TRACK}_${k}`] ?? L.ui[lang()][k] ?? L.ui.sw[k];
const ui = (k) => `ui-${L.ui.sw[`${TRACK}_${k}`] ? `${TRACK}_` : ''}${k}`; // audio clip name of an interface string
const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const done = () => JSON.parse(localStorage.done || '[]');
const inTrack = (m) => (m.track ?? 'ride') === TRACK;
const allDone = () => L.modules.filter(inTrack).every(isDone);
const requestedTopic = new URLSearchParams(location.search).get('topic');
const topic = requestedTopic === 'ride' && TRACK === 'ride' ? 'ride'
  : L.modules.find((m) => m.id === requestedTopic && inTrack(m))?.id;
let pos = [0, 0];
let currentUnit = null;

// ponytail: media served from the service worker cache may not play offline on iOS Safari (no Range support); Android Chrome is the target.
const player = new Audio();
function say(name) {
  player.src = audioPath(lang(), name);
  player.play().catch(() => {});
}
const ICONS = {
  home: 'M3 11L12 3L21 11M5 10V21H10V15H14V21H19V10',
  sound: 'M4 9H8L13 5V19L8 15H4ZM17 8Q21 12 17 16M19 5Q25 12 19 19',
  next: 'M4 12H20M13 5L20 12L13 19',
  check: 'M5 12L10 17L20 6',
  cross: 'M6 6L18 18M18 6L6 18',
  award: 'M8 3H16L19 6V12L16 15H8L5 12V6ZM8 15L6 22L12 19L18 22L16 15M9 9L11 11L15 7',
  share: 'M12 16V3M7 8L12 3L17 8M5 13V21H19V13',
};
const icon = (name) => `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONS[name]}"/></svg>`;
const speaker = (name) => `<button class="speak" data-say="${name}" aria-label="${u('listen')}">${icon('sound')}</button>`;

let ctx;
function beep(ok) {
  ctx ??= new AudioContext();
  const o = ctx.createOscillator(), g = ctx.createGain(), now = ctx.currentTime;
  o.type = ok ? 'sine' : 'square';
  o.frequency.setValueAtTime(ok ? 660 : 160, now);
  if (ok) o.frequency.linearRampToValueAtTime(990, now + 0.15);
  g.gain.setValueAtTime(0.15, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
  o.connect(g).connect(ctx.destination);
  o.start();
  o.stop(now + 0.35);
}

// Staff mode. A personal code from the admin portal links this phone to an employee record.
// Work track: completions are queued and sent when online. Rider track: anonymous by default and
// nothing is sent; an employee may opt in (riderTrack flag) to save refresher results for HSSE.
let staff = JSON.parse(localStorage.staff || 'null');
const riderOptIn = () => localStorage.riderTrack === '1';
const code = () => (TRACK === 'work' || riderOptIn() ? localStorage.staffCode : null);
const assigned = (m) => staff?.assignments.find((a) => a.module === m.id);
const isDone = (m) => { const a = assigned(m); return a ? ['current', 'due_soon'].includes(a.status) : done().includes(m.id); };
// Rider refresher enforcement: a rider module unlocks only after the previous rider module is done.
const isLocked = (m) => { if ((m.track ?? 'ride') !== 'ride' || !m.id) return false; const r = L.modules.filter((x) => (x.track ?? 'ride') === 'ride'); const i = r.findIndex((x) => x.id === m.id); return i > 0 && !isDone(r[i - 1]); };
const unitKey = (m, unit) => `${code() ?? 'local'}/${m.id}/${unit.id}/${assigned(m)?.next_due ?? assigned(m)?.due_date ?? ''}`;
const unitsDone = () => JSON.parse(localStorage.submodulesDone || '[]');
const isUnitDone = (m, unit) => isDone(m) || unitsDone().includes(unitKey(m, unit));
const unitSteps = (m) => currentUnit === null ? m.steps : m.submodules[currentUnit].steps.map((id) => m.steps.find((s) => s.id === id));
const day = (d) => new Date(d.slice(0, 10)).toLocaleDateString(lang(), { dateStyle: 'medium' });
function badge(m) {
  const a = assigned(m);
  const text = !a ? '' : a.status === 'overdue' ? u('staffOverdue') : a.status === 'pending' && a.due_date ? `${u('staffDue')} ${day(a.due_date)}`
    : a.status === 'due_soon' ? `${u('staffRefresh')} ${day(a.next_due)}` : '';
  return text ? `<span class="badge ${a.status}">${esc(text)}</span>` : '';
}
function staffBox() {
  if (TRACK === 'ride' && topic !== 'ride') return '';
  if (staff && code()) {
    const sc = staff.scenario, sm = sc && L.modules.find((x) => x.id === sc.module), ss = sm?.steps.find((x) => x.id === sc.step);
    const scenario = ss ? `<p><strong>${esc(sc.month)}</strong> · ${esc(t(sm.title))}: ${esc(t(ss.text))}</p><button class="ghost" ${(sm.track ?? 'ride') === 'ride' ? `data-mod="${L.modules.indexOf(sm)}"` : `data-topic="${sm.id}"`}>${u('next')}</button>` : '';
    return `<section class="staff"><p><strong>${u('staffHello')}, ${esc(staff.name)}</strong> <button class="ghost" data-go="signout">${u('staffOut')}</button></p>${scenario}<p class="fine">${u('staffPrivacy')}</p></section>`;
  }
  return `<form class="staff" data-form="signin">${TRACK === 'ride' ? `<p class="fine">${u('riderTrack')}</p>` : ''}<label>${u('staffPrompt')}<input name="code" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="12" required></label>
    <button class="big">${u('staffGo')}</button><p class="fine" id="staff-msg" role="alert"></p><p class="fine">${u('staffPrivacy')}</p></form>`;
}
const api = (path, body) => fetch(path, { method: body ? 'POST' : 'GET', headers: { 'X-Staff-Code': code() }, body: body && JSON.stringify(body) });
function signOut() {
  // Queued completions/answers stay on the phone, tagged to their employee; they are
  // sent only when that same person signs in again. Personal certificate fields go.
  for (const k of ['staffCode', 'staff', 'riderTrack', 'name', 'empId', 'dept', 'company']) localStorage.removeItem(k);
  staff = null;
  if (app.querySelector('.grid')) home();
}
async function sync() {
  if (!code()) return;
  try {
    // Queues are tagged with the employee code that earned them. On a shared phone,
    // another person's results stay queued untouched until that person signs in again.
    const mine = (x) => !x.for || x.for === code();
    for (const p of JSON.parse(localStorage.pending || '[]').filter(mine)) {
      const r = await api('api/complete', p);
      if (!r.ok && r.status !== 400) throw r; // 400 = module no longer exists: drop it
      localStorage.pending = JSON.stringify(JSON.parse(localStorage.pending).filter((x) => x !== p && !(x.at === p.at && x.module === p.module && x.for === p.for)));
    }
    for (const v of JSON.parse(localStorage.pendingViva || '[]').filter(mine)) {
      const r = await api('api/viva', v.self ? { module: v.module, self: v.self } : { module: v.module, audio_b64: v.audio, secs: v.secs });
      if (r.status === 503 || r.status === 429) break; // no Meta key / daily cap: keep the recording queued, try later
      if (!r.ok && r.status !== 400) throw r;
      localStorage.pendingViva = JSON.stringify(JSON.parse(localStorage.pendingViva || '[]').filter((x) => x !== v));
    }
    let quiz = JSON.parse(localStorage.pendingQuiz || '[]').filter(mine);
    while (quiz.length) {
      const batch = quiz.slice(0, 50); // bounded batches: a long offline queue is never lost at once
      const r = await api('api/quiz', { results: batch });
      if (!r.ok && r.status !== 400) throw r;
      localStorage.pendingQuiz = JSON.stringify(JSON.parse(localStorage.pendingQuiz || '[]').filter((x) => !batch.includes(x)));
      quiz = JSON.parse(localStorage.pendingQuiz || '[]').filter(mine);
      if (!r.ok) break; // 400 batch dropped (e.g. a removed step); continue with the rest
    }
    const r = await api('api/me');
    if (!r.ok) throw r;
    staff = await r.json();
    localStorage.staff = JSON.stringify(staff);
    if (app.querySelector('.grid')) home();
  } catch (e) {
    if (e?.status === 401) signOut(); // code was reset or the person was deactivated; offline or server errors just retry later
  }
}
async function signIn(value) {
  if (TRACK === 'ride') localStorage.riderTrack = '1'; // explicit opt-in: only now may the rider app send results
  const next = value.toUpperCase().replace(/\s/g, '');
  if (localStorage.staffCode && localStorage.staffCode !== next) staff = null; // never show the previous person's name or assignments
  localStorage.staffCode = next;
  const button = app.querySelector('[data-form="signin"] button');
  if (button) button.disabled = true;
  await sync();
  if (staff) return;
  const bad = !code(); // sync() signs out on 401; anything else is network or server trouble
  localStorage.removeItem('staffCode');
  if (TRACK === 'ride') localStorage.removeItem('riderTrack');
  const msg = app.querySelector('#staff-msg');
  if (msg) msg.textContent = u(bad ? 'staffBad' : 'staffOffline');
  if (button) button.disabled = false;
}
function startStaff() { // sign-in form, retry when back online, and the personal link work.html?c=CODE
  app.addEventListener('submit', (e) => {
    if (e.target.dataset.form !== 'signin') return;
    e.preventDefault();
    signIn(new FormData(e.target).get('code'));
  });
  window.addEventListener('online', sync);
  const link = new URLSearchParams(location.search).get('c');
  if (link && TRACK === 'work') { history.replaceState(null, '', location.pathname); signIn(link); }
}
function record(mi) {
  if (!code()) return;
  const m = L.modules[mi], a = assigned(m), at = new Date().toISOString();
  if (a) { a.status = 'current'; a.last_completed = at; localStorage.staff = JSON.stringify(staff); }
  localStorage.pending = JSON.stringify([...JSON.parse(localStorage.pending || '[]'), { module: m.id, at, for: code() }]);
  sync();
}

function home() {
  currentUnit = null;
  const riding = L.modules.filter((m) => (m.track ?? 'ride') === 'ride');
  const work = L.modules.filter((m) => m.track === 'work');
  const selected = L.modules.find((m) => m.id === topic);
  const cards = !topic ? [{ title: Object.fromEntries(Object.keys(L.langs).map((l) => [l, L.ui[l].motorcycle])), steps: riding[0].steps, target: 'data-topic="ride"', count: riding.length, complete: riding.every(isDone) },
    ...work.map((m) => ({ ...m, target: `data-topic="${m.id}"`, count: m.submodules.length, complete: isDone(m) }))]
    : selected ? selected.submodules.map((unit, i) => ({ ...unit, steps: unit.steps.map((id) => selected.steps.find((s) => s.id === id)),
      target: `data-unit="${L.modules.indexOf(selected)}:${i}"`, complete: isUnitDone(selected, unit) }))
    : riding.map((m) => ({ ...m, target: `data-mod="${L.modules.indexOf(m)}"`, complete: isDone(m) }));
  app.innerHTML = `
    ${topic ? `<button class="ghost" data-go="topics">${icon('home')} ${u('topics')}</button>` : ''}
    <header class="top">
      <h1>${!topic ? u('hubName') : selected ? t(selected.title) : u('appName')}</h1>
      <p class="tag">${!topic ? u('hubTagline') : selected ? `${selected.submodules.length} ${u('submodules')}` : u('tagline')}</p>
      <nav class="langs">${Object.entries(L.langs)
        .map(([k, v]) => `<button data-lang="${k}" aria-pressed="${k === lang()}">${v}</button>`).join('')}</nav>
    </header>
    <section class="intro">${speaker(ui(topic ? 'intro' : 'hubIntro'))}<p>${u(topic ? 'intro' : 'hubIntro')}</p></section>
    ${staffBox()}
    <section class="grid">${cards.map((m, n) => `
      <button class="card${m.complete ? ' done' : ''}" ${m.target} ${isLocked(m) ? 'disabled' : ''} aria-label="${t(m.title)}${m.complete ? '. ' + u('moduleDone') : ''}">
        <span class="card-picture">${ART[m.steps[0].art]?.() ?? m.icon}<span class="card-number" aria-hidden="true">${String(n + 1).padStart(2, '0')}</span></span>
        <span class="card-title">${t(m.title)}${m.count ? `<span class="card-count">${m.count} ${u('submodules')}</span>` : ''}${isLocked(m) ? `<span class="card-count">${u('locked')}</span>` : ''}${badge(m)}</span>${m.complete ? `<span class="tick" aria-hidden="true">${icon('check')}</span>` : ''}
      </button>`).join('')}</section>
    ${topic && allDone() ? `<button class="big" data-go="cert">${icon('award')} ${u('getCert')}</button>` : ''}
    ${navigator.share ? `<button class="ghost" data-go="share-site">${icon('share')} ${u('shareSite')}</button>` : ''}
    <footer>
      <p>${speaker(ui('disclaimer'))} <strong>${u('disclaimerTitle')}:</strong> ${u('disclaimer')}</p>
      <p>${u('brand')} · <a href="https://github.com/Masika-Ventures/endesha-salama">${u('openSource')}</a></p>
    </footer>`;
}

function hook(mi) { // opening line: capture attention before the first lesson step
  const m = L.modules[mi];
  if (!m.hook) return step(mi, 0);
  currentUnit = null;
  pos = [mi, 0];
  scrollTo(0, 0);
  app.innerHTML = `
    <header class="bar"><button data-go="home" aria-label="${u('home')}">${icon('home')}</button><span>${t(m.title)}</span></header>
    <div class="pic" aria-hidden="true">${ART[m.steps[0].art]?.() ?? m.icon}</div>
    <section class="lesson-copy"><p class="text">${t(m.hook)}</p>${speaker(`${m.id}-hook`)}</section>
    <button class="big" data-hookstart="${mi}">${u('next')} ${icon('next')}</button>`;
  say(`${m.id}-hook`);
}

const queueViva = (item) => { localStorage.pendingViva = JSON.stringify([...JSON.parse(localStorage.pendingViva || '[]'), { ...item, for: code(), at: new Date().toISOString() }]); sync(); };
function vivaThanks() {
  app.innerHTML = `<header class="bar"><button data-go="home" aria-label="${u('home')}">${icon('home')}</button><span>${u('vivaTitle')}</span></header>
    <div class="pic" aria-hidden="true">🎤</div><section class="lesson-copy"><p class="text">${u('vivaThanks')}</p></section>
    <button class="big" data-go="home">${u('home')}</button>`;
}
function viva(mi) {
  const m = L.modules[mi];
  if (!m.viva) return home();
  pos = [mi, m.steps.length - 1]; currentUnit = null; vivaState = null;
  const signed = !!code();
  const canRecord = signed && !!navigator.mediaDevices?.getUserMedia && typeof AudioContext !== 'undefined';
  app.innerHTML = `
    <header class="bar"><button data-go="home" aria-label="${u('home')}">${icon('home')}</button><span>${u('vivaTitle')} · ${t(m.title)}</span></header>
    <div class="pic" aria-hidden="true">${ART[m.steps[0].art]?.() ?? m.icon}</div>
    <section class="lesson-copy"><p class="text">${t(m.viva.q)}</p>${speaker(`${m.id}-viva`)}
    <p class="fine">${u('vivaIntro')}</p><p class="fine">${signed ? u('vivaConsent') : u('vivaPractice')}</p></section>
    ${canRecord ? `<button class="big" data-vivarec="1">🎤 ${u('vivaRecord')}</button><p class="text" id="viva-status" role="status"></p><div id="viva-review"></div>`
      : `<p class="text">${u('vivaListenModel')} ${speaker(`${m.id}-viva-model`)}</p><p class="text">${u('vivaSelfQ')}</p>
         <div class="answers"><button class="answer" data-vivaself="good">${u('vivaGood')}</button><button class="answer" data-vivaself="learning">${u('vivaLearning')}</button></div>`}`;
  say(`${m.id}-viva`);
}
function encodeWav(chunks, rate) { // mono 16-bit WAV, resampled to 16 kHz for the speech API
  const flat = chunks.flatMap((c) => [...c]);
  const ratio = rate / 16000, out = [];
  for (let i = 0; i < flat.length; i += ratio) out.push(flat[Math.floor(i)]);
  const buf = new ArrayBuffer(44 + out.length * 2), v = new DataView(buf);
  const wstr = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  wstr(0, 'RIFF'); v.setUint32(4, 36 + out.length * 2, true); wstr(8, 'WAVEfmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 16000, true); v.setUint32(28, 32000, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); wstr(36, 'data'); v.setUint32(40, out.length * 2, true);
  out.forEach((s, i) => v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 32767, true));
  return new Blob([buf], { type: 'audio/wav' });
}
async function vivaRecord() {
  const status = app.querySelector('#viva-status'), btn = app.querySelector('[data-vivarec]');
  if (vivaState) { // stop
    clearTimeout(vivaState.timer); vivaState.node.disconnect(); vivaState.stream.getTracks().forEach((tr) => tr.stop());
    const blob = encodeWav(vivaState.chunks, vivaState.ctx.sampleRate), secs = Math.max(1, Math.round((Date.now() - vivaState.started) / 1000));
    vivaState.ctx.close(); vivaState = { blob, secs };
    app.querySelector('#viva-review').innerHTML = `<audio controls src="${URL.createObjectURL(blob)}" style="width:100%"></audio>
      <button class="big" data-vivasend="1">${u('vivaSend')}</button><button class="big ghost" data-viva="${pos[0]}">${u('vivaAgain')}</button>`;
    btn.remove(); status.textContent = '';
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const ctx = new AudioContext(), src = ctx.createMediaStreamSource(stream), node = ctx.createScriptProcessor(4096, 1, 1);
    const chunks = [];
    node.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    src.connect(node); node.connect(ctx.destination);
    vivaState = { ctx, node, stream, chunks, started: Date.now(), timer: setTimeout(() => vivaRecord(), 20000) };
    btn.textContent = `⏹ ${u('vivaStop')}`; status.textContent = '●';
  } catch { status.textContent = u('vivaPractice'); }
}

function step(mi, si) {
  const m = L.modules[mi], steps = unitSteps(m), s = steps[si];
  if (!s) return finish(mi);
  pos = [mi, si];
  scrollTo(0, 0);
  app.innerHTML = `
    <header class="bar"><button data-go="home" aria-label="${u('home')}">${icon('home')}</button><span>${t(currentUnit === null ? m.title : m.submodules[currentUnit].title)}</span></header>
    <div class="dots">${steps.map((_, i) => `<i class="${i < si ? 'past' : i === si ? 'now' : ''}"></i>`).join('')}</div>
    <div class="pic" aria-hidden="true">${ART[s.art]?.() ?? s.pic}</div>
    <section class="lesson-copy"><p class="text">${t(s.text)}</p>${speaker(s.id)}</section>
    ${s.source ? `<p class="source">${u('source')}: <a href="${s.source.url}" target="_blank" rel="noopener">${s.source.label}</a></p>` : ''}
    ${s.answer ? s.options ? `<div class="answers choices">
        ${s.options.map((o) => `<button data-answer="${o.id}"><strong>${o.id.toUpperCase()}.</strong><span>${t(o.text)}</span></button>`).join('')}
      </div>` : `<div class="answers">
        <button class="safe" data-answer="safe">${icon('check')}<span>${u('safe')}</span></button>
        <button class="danger" data-answer="danger">${icon('cross')}<span>${u('danger')}</span></button>
      </div>` : `<button class="big" data-go="next">${u('next')} ${icon('next')}</button>`}`;
  say(s.id);
}

function answer(choice) {
  const s = unitSteps(L.modules[pos[0]])[pos[1]], ok = choice === s.answer;
  if (code()) { // opted-in employee: queue the quiz result for HSSE tracking (never for anonymous riders)
    localStorage.pendingQuiz = JSON.stringify([...JSON.parse(localStorage.pendingQuiz || '[]'),
      { module: L.modules[pos[0]].id, step: s.id, correct: ok, at: new Date().toISOString(), for: code() }]);
  }
  beep(ok);
  app.querySelector('.answers').outerHTML = `
    <div class="feedback ${ok ? 'good' : 'bad'}" role="status">
      <strong>${icon(ok ? 'check' : 'cross')} ${u(ok ? 'correct' : 'wrong')}</strong>
      ${s.options ? `<p><strong class="right">${u('rightAnswer')}:</strong> ${s.answer.toUpperCase()}. ${t(s.options.find((o) => o.id === s.answer).text)}</p>` : ''}
      <p>${t(s.why)} ${speaker(s.id + '-why')}</p>
    </div>
    <button class="big" data-go="next">${u('next')} ${icon('next')}</button>`;
  app.querySelector('[data-go="next"]').focus();
  setTimeout(() => say(s.id + '-why'), 400);
}

function finish(mi) {
  if (currentUnit !== null) return finishUnit(mi);
  scrollTo(0, 0);
  localStorage.done = JSON.stringify([...new Set([...done(), L.modules[mi].id])]);
  record(mi);
  const ni = L.modules.findIndex((m, i) => i > mi && inTrack(m)), next = L.modules[ni];
  app.innerHTML = `
    <div class="pic party" aria-hidden="true">${icon('award')}</div>
    <h2>${u('moduleDone')}</h2>
    ${L.modules[mi].viva ? `<button class="big" data-viva="${mi}">🎤 ${u('vivaTitle')}</button>` : ''}
    ${allDone() ? `<p class="text">${u('allDone')}</p><button class="big" data-go="cert">${icon('award')} ${u('getCert')}</button>`
      : next ? `<button class="big" data-mod="${ni}">${t(next.title)} ${icon('next')}</button>` : ''}
    <button class="ghost" data-go="home">${icon('home')} ${u('home')}</button>`;
  say(allDone() ? ui('allDone') : ui('moduleDone'));
}

function finishUnit(mi) {
  const m = L.modules[mi], unit = m.submodules[currentUnit];
  localStorage.submodulesDone = JSON.stringify([...new Set([...unitsDone(), unitKey(m, unit)])]);
  const complete = m.submodules.every((s) => isUnitDone(m, s));
  if (complete) {
    localStorage.done = JSON.stringify([...new Set([...done(), m.id])]);
    record(mi);
  }
  const next = m.submodules[currentUnit + 1];
  scrollTo(0, 0);
  app.innerHTML = `
    <div class="pic party" aria-hidden="true">${icon('award')}</div>
    <h2>${u('moduleDone')}</h2>
    <p class="text">${t(unit.title)}</p>
    ${complete && m.viva ? `<button class="big" data-viva="${mi}">🎤 ${u('vivaTitle')}</button>` : ''}
    ${complete && allDone() ? `<button class="big" data-go="cert">${icon('award')} ${u('getCert')}</button>`
      : next ? `<button class="big" data-unit="${mi}:${currentUnit + 1}">${t(next.title)} ${icon('next')}</button>` : ''}
    <button class="ghost" data-go="home">${icon('home')} ${t(m.title)}</button>`;
  say(ui('moduleDone'));
}

const canvas = Object.assign(document.createElement('canvas'), { width: 1080, height: 1080 });
let certBlob;
function draw() {
  const c = canvas.getContext('2d'), W = 1080;
  const line = (txt, y, size, color = '#fff', weight = '') => {
    c.font = `${weight} ${size}px Overpass, system-ui, sans-serif`;
    c.fillStyle = color;
    c.fillText(txt, W / 2, y, W - 120);
  };
  c.fillStyle = '#f6f3ec';
  c.fillRect(0, 0, W, W);
  c.fillStyle = '#0f2a44';
  c.fillRect(24, 24, W - 48, W - 48);
  c.fillStyle = '#ffb300';
  c.fillRect(0, 0, W, 28);
  c.fillRect(0, W - 28, W, 28);
  c.textAlign = 'center';
  const mark = (name, x, y, size) => {
    c.save();
    c.translate(x, y);
    c.scale(size / 24, size / 24);
    c.strokeStyle = '#ffb300';
    c.lineWidth = 1.5;
    c.lineCap = c.lineJoin = 'round';
    c.stroke(new Path2D(ICONS[name]));
    c.restore();
  };
  mark('award', 465, 95, 150);
  line(u('certTitle'), 350, 60, '#fff', 'bold');
  line(localStorage.name || staff?.name || '', 480, 84, '#ffb300', 'bold');
  const idLine = [localStorage.empId, localStorage.dept, localStorage.company].filter(Boolean).join(' · ');
  if (idLine) line(idLine, 532, 30);
  line(u('certBody'), 570, 40);
  const marks = L.modules.filter(inTrack);
  marks.forEach((_, i) => mark('check', 540 - ((marks.length - 1) * 110 + 48) / 2 + i * 110, 645, 48));
  line(new Date().toLocaleDateString(lang(), { dateStyle: 'long' }), 800, 36);
  line(u('brand'), 930, 34, '#ffb300');
  line(location.host + location.pathname.replace(/index\.html$/, ''), 990, 30);
  app.querySelector('#cert').src = canvas.toDataURL();
  canvas.toBlob((b) => (certBlob = b));
}

function cert() {
  app.innerHTML = `
    <header class="bar"><button data-go="home" aria-label="${u('home')}">${icon('home')}</button><span>${u('certTitle')}</span></header>
    <label class="name">${u('namePrompt')} <input id="name" autocomplete="name" maxlength="40"></label>
    <label class="name">${u('empPrompt')} <input id="empId" maxlength="40"></label>
    <label class="name">${u('deptPrompt')} <input id="dept" maxlength="60"></label>
    <label class="name">${u('companyPrompt')} <input id="company" maxlength="60"></label>
    <img id="cert" class="cert" alt="${u('certTitle')}">
    <button class="big" data-go="share-cert">${icon('share')} ${u('shareCert')}</button>`;
  const input = app.querySelector('#name');
  input.value = localStorage.name || staff?.name || '';
  input.oninput = () => { localStorage.name = input.value; draw(); };
  for (const k of ['empId', 'dept', 'company']) {
    const el = app.querySelector(`#${k}`);
    el.value = localStorage[k] || '';
    el.oninput = () => { localStorage[k] = el.value; draw(); };
  }
  // Canvas text does not wait for web fonts; load Overpass first or the certificate falls back.
  document.fonts.load('bold 60px Overpass').finally(draw);
  say(ui('certReady'));
}

function shareCert() {
  if (!certBlob) return;
  const file = new File([certBlob], 'endesha-salama.png', { type: 'image/png' });
  const data = { files: [file], title: u('appName'), text: `${u('certTitle')} — ${location.href}` };
  if (navigator.canShare?.(data)) return navigator.share(data).catch(() => {});
  Object.assign(document.createElement('a'), { href: URL.createObjectURL(certBlob), download: file.name }).click();
}

// Warm only the selected module and shared interface clips, after offline caching is ready.
async function prefetch(mi) {
  const clips = audioItems({ ...L, modules: [L.modules[mi]] }).filter((a) => a.lang === lang());
  if (navigator.serviceWorker && !navigator.serviceWorker.controller)
    await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
  clips.forEach((a) => fetch(a.file).catch(() => {}));
}

app.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const d = b.dataset;
  if (d.lang) {
    localStorage.lang = document.documentElement.lang = d.lang;
    home();
    say(ui(topic ? 'intro' : 'hubIntro'));
  } else if (d.say) say(d.say);
  else if (d.topic) location.href = `${d.topic === 'ride' ? 'index.html' : 'work.html'}?topic=${d.topic}`;
  else if (d.unit) { const [mi, si] = d.unit.split(':').map(Number); currentUnit = si; prefetch(mi); step(mi, 0); }
  else if (d.mod) { if (isLocked(L.modules[+d.mod])) return; currentUnit = null; prefetch(+d.mod); hook(+d.mod); }
  else if (d.hookstart !== undefined) step(+d.hookstart, 0);
  else if (d.viva !== undefined) viva(+d.viva);
  else if (d.vivarec) vivaRecord();
  else if (d.vivasend) { const blob = vivaState?.blob; if (!blob) return; blob.arrayBuffer().then((ab) => { let bin = ''; const bytes = new Uint8Array(ab); for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192)); queueViva({ module: L.modules[pos[0]].id, audio: btoa(bin), secs: vivaState.secs }); vivaThanks(); }); }
  else if (d.vivaself) { if (code()) queueViva({ module: L.modules[pos[0]].id, self: d.vivaself }); vivaThanks(); }
  else if (d.answer) answer(d.answer);
  else if (d.go === 'next') step(pos[0], pos[1] + 1);
  else if (d.go === 'home') { player.pause(); home(); scrollTo(0, 0); }
  else if (d.go === 'topics') location.href = location.pathname;
  else if (d.go === 'cert') { cert(); scrollTo(0, 0); }
  else if (d.go === 'signout') signOut();
  else if (d.go === 'share-cert') shareCert();
  else if (d.go === 'share-site') navigator.share({ title: u('appName'), text: u('tagline'), url: location.origin + location.pathname }).catch(() => {});
});

document.documentElement.lang = lang();
startStaff();
home();
sync();
navigator.serviceWorker?.register('sw.js');
