import { audioItems, audioPath } from './content.js';
import { ART } from './art.js';

const L = await fetch('lessons.json').then((r) => r.json());
const app = document.getElementById('app');
const lang = () => (localStorage.lang in L.langs ? localStorage.lang : 'sw');
const t = (o) => o[lang()] ?? o.sw;
const u = (k) => L.ui[lang()][k] ?? L.ui.sw[k];
const done = () => JSON.parse(localStorage.done || '[]');
const allDone = () => L.modules.every((m) => done().includes(m.id));
let pos = [0, 0];

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

function home() {
  const d = done();
  app.innerHTML = `
    <header class="top">
      <h1>${u('appName')}</h1>
      <p class="tag">${u('tagline')}</p>
      <nav class="langs">${Object.entries(L.langs)
        .map(([k, v]) => `<button data-lang="${k}" aria-pressed="${k === lang()}">${v}</button>`).join('')}</nav>
    </header>
    <section class="intro">${speaker('ui-intro')}<p>${u('intro')}</p></section>
    <section class="grid">${L.modules.map((m, i) => `
      <button class="card${d.includes(m.id) ? ' done' : ''}" data-mod="${i}" aria-label="${t(m.title)}${d.includes(m.id) ? '. ' + u('moduleDone') : ''}">
        <span class="card-picture">${ART[m.steps[0].art]?.() ?? m.icon}<span class="card-number" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span></span>
        <span class="card-title">${t(m.title)}</span>${d.includes(m.id) ? `<span class="tick" aria-hidden="true">${icon('check')}</span>` : ''}
      </button>`).join('')}</section>
    ${allDone() ? `<button class="big" data-go="cert">${icon('award')} ${u('getCert')}</button>` : ''}
    ${navigator.share ? `<button class="ghost" data-go="share-site">${icon('share')} ${u('shareSite')}</button>` : ''}
    <footer>
      <p>${speaker('ui-disclaimer')} <strong>${u('disclaimerTitle')}:</strong> ${u('disclaimer')}</p>
      <p>${u('brand')} · <a href="https://github.com/Masika-Ventures/endesha-salama">${u('openSource')}</a></p>
    </footer>`;
}

function step(mi, si) {
  const m = L.modules[mi], s = m.steps[si];
  if (!s) return finish(mi);
  pos = [mi, si];
  app.innerHTML = `
    <header class="bar"><button data-go="home" aria-label="${u('home')}">${icon('home')}</button><span>${t(m.title)}</span></header>
    <div class="dots">${m.steps.map((_, i) => `<i class="${i < si ? 'past' : i === si ? 'now' : ''}"></i>`).join('')}</div>
    <div class="pic" aria-hidden="true">${ART[s.art]?.() ?? s.pic}</div>
    <section class="lesson-copy"><p class="text">${t(s.text)}</p>${speaker(s.id)}</section>
    ${s.answer ? `<div class="answers">
        <button class="safe" data-answer="safe">${icon('check')}<span>${u('safe')}</span></button>
        <button class="danger" data-answer="danger">${icon('cross')}<span>${u('danger')}</span></button>
      </div>` : `<button class="big" data-go="next">${u('next')} ${icon('next')}</button>`}`;
  say(s.id);
}

function answer(choice) {
  const s = L.modules[pos[0]].steps[pos[1]], ok = choice === s.answer;
  beep(ok);
  app.querySelector('.answers').outerHTML = `
    <div class="feedback ${ok ? 'good' : 'bad'}">
      <strong>${icon(ok ? 'check' : 'cross')} ${u(ok ? 'correct' : 'wrong')}</strong>
      <p>${t(s.why)} ${speaker(s.id + '-why')}</p>
    </div>
    <button class="big" data-go="next">${u('next')} ${icon('next')}</button>`;
  setTimeout(() => say(s.id + '-why'), 400);
}

function finish(mi) {
  localStorage.done = JSON.stringify([...new Set([...done(), L.modules[mi].id])]);
  const next = L.modules[mi + 1];
  app.innerHTML = `
    <div class="pic party" aria-hidden="true">${icon('award')}</div>
    <h2>${u('moduleDone')}</h2>
    ${allDone() ? `<p class="text">${u('allDone')}</p><button class="big" data-go="cert">${icon('award')} ${u('getCert')}</button>`
      : next ? `<button class="big" data-mod="${mi + 1}">${t(next.title)} ${icon('next')}</button>` : ''}
    <button class="ghost" data-go="home">${icon('home')} ${u('home')}</button>`;
  say(allDone() ? 'ui-allDone' : 'ui-moduleDone');
}

const canvas = Object.assign(document.createElement('canvas'), { width: 1080, height: 1080 });
let certBlob;
function draw() {
  const c = canvas.getContext('2d'), W = 1080;
  const line = (txt, y, size, color = '#fff', weight = '') => {
    c.font = `${weight} ${size}px system-ui, sans-serif`;
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
  line(localStorage.name || '', 480, 84, '#ffb300', 'bold');
  line(u('certBody'), 570, 40);
  L.modules.forEach((_, i) => mark('check', 240 + i * 110, 645, 48));
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
    <img id="cert" class="cert" alt="${u('certTitle')}">
    <button class="big" data-go="share-cert">${icon('share')} ${u('shareCert')}</button>`;
  const input = app.querySelector('#name');
  input.value = localStorage.name || '';
  input.oninput = () => { localStorage.name = input.value; draw(); };
  draw();
  say('ui-certReady');
}

function shareCert() {
  if (!certBlob) return;
  const file = new File([certBlob], 'endesha-salama.png', { type: 'image/png' });
  const data = { files: [file], title: u('appName'), text: `${u('certTitle')} — ${location.href}` };
  if (navigator.canShare?.(data)) return navigator.share(data).catch(() => {});
  Object.assign(document.createElement('a'), { href: URL.createObjectURL(certBlob), download: file.name }).click();
}

// Warm the offline cache with every clip in the current language.
const prefetch = () => audioItems(L).filter((a) => a.lang === lang()).forEach((a) => fetch(a.file).catch(() => {}));

app.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const d = b.dataset;
  if (d.lang) {
    localStorage.lang = document.documentElement.lang = d.lang;
    home();
    say('ui-intro');
    prefetch();
  } else if (d.say) say(d.say);
  else if (d.mod) step(+d.mod, 0);
  else if (d.answer) answer(d.answer);
  else if (d.go === 'next') step(pos[0], pos[1] + 1);
  else if (d.go === 'home') { player.pause(); home(); }
  else if (d.go === 'cert') cert();
  else if (d.go === 'share-cert') shareCert();
  else if (d.go === 'share-site') navigator.share({ title: u('appName'), text: u('tagline'), url: location.origin + location.pathname }).catch(() => {});
});

document.documentElement.lang = lang();
home();
prefetch();
navigator.serviceWorker?.register('sw.js');
