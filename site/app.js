import { audioItems } from './content.js';

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
  player.src = `audio/${lang()}/${name}.mp3`;
  player.play().catch(() => {});
}
const speaker = (name) => `<button class="speak" data-say="${name}" aria-label="${u('listen')}">🔊</button>`;

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
      <h1>🏍️ ${u('appName')}</h1>
      <p class="tag">${u('tagline')}</p>
      <nav class="langs">${Object.entries(L.langs)
        .map(([k, v]) => `<button data-lang="${k}" aria-pressed="${k === lang()}">${v}</button>`).join('')}</nav>
    </header>
    <section class="intro">${speaker('ui-intro')}<p>${u('intro')}</p></section>
    <section class="grid">${L.modules.map((m, i) => `
      <button class="card${d.includes(m.id) ? ' done' : ''}" data-mod="${i}" style="--i:${i}">
        <span class="icon">${m.icon}</span><span>${t(m.title)}</span>${d.includes(m.id) ? '<span class="tick">✅</span>' : ''}
      </button>`).join('')}</section>
    ${allDone() ? `<button class="big" data-go="cert">🏅 ${u('getCert')}</button>` : ''}
    ${navigator.share ? `<button class="ghost" data-go="share-site">📤 ${u('shareSite')}</button>` : ''}
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
    <header class="bar"><button data-go="home" aria-label="${u('home')}">🏠</button><span>${m.icon} ${t(m.title)}</span></header>
    <div class="dots">${m.steps.map((_, i) => `<i class="${i < si ? 'past' : i === si ? 'now' : ''}"></i>`).join('')}</div>
    <div class="pic" aria-hidden="true">${s.pic}</div>
    <p class="text">${t(s.text)} ${speaker(s.id)}</p>
    ${s.answer ? `<div class="answers">
        <button class="safe" data-answer="safe">✅<span>${u('safe')}</span></button>
        <button class="danger" data-answer="danger">❌<span>${u('danger')}</span></button>
      </div>` : `<button class="big" data-go="next">${u('next')} ➜</button>`}`;
  say(s.id);
}

function answer(choice) {
  const s = L.modules[pos[0]].steps[pos[1]], ok = choice === s.answer;
  beep(ok);
  app.querySelector('.answers').outerHTML = `
    <div class="feedback ${ok ? 'good' : 'bad'}">
      <strong>${ok ? '🎉 ' + u('correct') : '🤔 ' + u('wrong')}</strong>
      <p>${t(s.why)} ${speaker(s.id + '-why')}</p>
    </div>
    <button class="big" data-go="next">${u('next')} ➜</button>`;
  setTimeout(() => say(s.id + '-why'), 400);
}

function finish(mi) {
  localStorage.done = JSON.stringify([...new Set([...done(), L.modules[mi].id])]);
  const next = L.modules[mi + 1];
  app.innerHTML = `
    <div class="pic party" aria-hidden="true">🏆</div>
    <h2>${u('moduleDone')}</h2>
    ${allDone() ? `<p class="text">${u('allDone')}</p><button class="big" data-go="cert">🏅 ${u('getCert')}</button>`
      : next ? `<button class="big" data-mod="${mi + 1}">${next.icon} ${t(next.title)} ➜</button>` : ''}
    <button class="ghost" data-go="home">🏠 ${u('home')}</button>`;
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
  c.fillStyle = '#0f2a44';
  c.fillRect(0, 0, W, W);
  c.fillStyle = '#ffb300';
  c.fillRect(0, 0, W, 28);
  c.fillRect(0, W - 28, W, 28);
  c.textAlign = 'center';
  line('🏍️ 🏅', 220, 150);
  line(u('certTitle'), 350, 60, '#fff', 'bold');
  line(localStorage.name || '', 480, 84, '#ffb300', 'bold');
  line(u('certBody'), 570, 40);
  line(L.modules.map((m) => m.icon).join('  '), 690, 64);
  line(new Date().toLocaleDateString(lang(), { dateStyle: 'long' }), 800, 36);
  line(u('brand'), 930, 34, '#ffb300');
  line(location.host + location.pathname.replace(/index\.html$/, ''), 990, 30);
  app.querySelector('#cert').src = canvas.toDataURL();
  canvas.toBlob((b) => (certBlob = b));
}

function cert() {
  app.innerHTML = `
    <header class="bar"><button data-go="home" aria-label="${u('home')}">🏠</button><span>🏅 ${u('certTitle')}</span></header>
    <label class="name">${u('namePrompt')} <input id="name" autocomplete="name" maxlength="40"></label>
    <img id="cert" class="cert" alt="${u('certTitle')}">
    <button class="big" data-go="share-cert">📤 ${u('shareCert')}</button>`;
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
