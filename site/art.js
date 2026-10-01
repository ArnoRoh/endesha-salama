// Ink outlines with one amber teaching point. Motion lives in style.css.
// Shared parts use local coordinates; each scene places them inside the same dark panel.
const NAVY = '#0f2a44', SLATE = '#263b4b';
const svg = (body) => `<svg class="art" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 200" aria-hidden="true"><rect width="240" height="200" rx="16" fill="${NAVY}"/><g fill="none" stroke="#e9eef3" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`;
const place = (x, y, scale, body) => `<g transform="translate(${x} ${y}) scale(${scale})">${body}</g>`;
const focus = (body, cls = '') => `<g class="focus ${cls}" stroke="#ffb300">${body}</g>`;

// Full-face helmet, front view: sealed visor, cheek padding and solid chin bar.
const helmet = (lit = false) => {
  const shell = `<path d="M-25 27C-26 9-17 0 0 0S26 9 25 27L22 43Q18 53 0 54Q-18 53-22 43Z" fill="${NAVY}"/>`;
  return (lit ? focus(shell, 'ink-glow') : shell) + `<path d="M-20 19Q0 13 20 19L18 32Q0 38-18 32Z" fill="${SLATE}"/><path d="M-15 22Q0 18 14 22M-19 36L-14 43Q0 49 14 43L19 36M-8 43H8M-5 47H5"/><path d="M-16 10Q0 5 16 10" stroke-width="1"/>`;
};
const neck = () => `<path d="M-12 50L-13 65Q0 72 13 65L12 50" fill="${SLATE}"/>`;
const body = () => `<path d="M-13 62L-39 72Q-48 76-51 91L-55 136H55L51 91Q48 76 39 72L13 62L0 76Z" fill="${NAVY}"/><path d="M-39 76L-33 136M39 76L33 136M0 76V136M-13 62L-21 75L-8 83M13 62L21 75L8 83"/>`;
const strap = () => `<path d="M-18 49L-12 60H12L18 49" stroke-width="2.6"/><rect x="-4" y="57" width="8" height="6" rx="1" fill="${SLATE}"/>`;
const riderBust = (lit = false, litStrap = false) => body() + neck() + helmet(lit) + (litStrap ? focus(strap()) : strap());

// The buckle is the main drawing here, rather than a small side-view detail.
const chin = () => place(120, 17, 1.65, neck() + helmet()) + `<path d="M60 182Q61 163 86 156L99 147M180 182Q179 163 154 156L141 147M99 147Q120 156 141 147"/>`;
const chinStrap = (closed) => closed
  ? focus(`<path d="M90 100L98 111Q100 119 105 119M150 100L142 111Q140 119 135 119" stroke-width="5"/><rect x="105" y="111" width="30" height="16" rx="3" fill="${SLATE}"/><path d="M119 112V126M125 117H130" stroke-width="2"/>`, 'ink-tighten')
  : focus(`<path d="M90 100L83 139" stroke-width="5"/><rect x="74" y="139" width="18" height="17" rx="2" fill="${SLATE}"/><path d="M79 144H87V151H79Z" stroke-width="1.4"/><g class="ink-dangle"><path d="M150 100L158 136" stroke-width="5"/><path d="M150 136H166V144H162V153H154V144H150Z" fill="${SLATE}"/></g>`);

const vest = () => focus(`<path d="M-15 65L-34 70L-30 95L-34 136H34L30 95L34 70L15 65L0 84Z" fill="${SLATE}"/><path d="M-23 74L-19 105M23 74L19 105M-30 110H30M-32 120H32" stroke-width="5"/><path d="M0 84V136" stroke-width="1.2"/>`, 'ink-glow');
const boot = () => `<path d="M-27 0H12L15 44Q23 52 43 57Q61 60 63 74V85H-30V61L-27 45Z" fill="${SLATE}"/><path d="M-30 76H62M-17 13H5M-17 23H6M-16 33H7M-12 10L-10 44L14 62M-21 84V89H61V85M-20 86V89M-5 86V89M10 86V89M25 86V89M40 86V89M54 86V89"/><path d="M36 60Q35 67 37 75"/>`;
const hand = () => `<path d="M-19 72L-20 48L-32 29Q-35 22-30 20Q-25 18-21 25L-15 33L-15 8Q-15 1-10 1Q-5 1-5 8V27L-4-3Q-4-10 1-10Q6-10 6-3V27L8 1Q8-5 13-4Q18-3 17 4L16 29L20 12Q21 6 26 8Q31 10 29 16L24 46Q22 58 17 62V72Z" fill="${SLATE}"/><path d="M-19 61H18M-19 70H17M-12 37Q0 31 15 38M-7 45L-5 55M2 43V54M10 45L8 55"/>`;
const foot = () => `<path d="M-30-55L-28-6Q-24 8-10 13L40 19Q54 22 57 30Q58 36 48 37H-23Q-39 35-39 26L-40-55" fill="${SLATE}"/><path d="M-27 15Q-19 11-12 16M40 25L47 28M49 30L53 32" stroke-width="1.2"/><path d="M-42 39H57Q62 39 61 43H-43Z" fill="${NAVY}"/><path d="M-18 36L5 19L25 37" stroke-width="4"/>`;
// Cropped cockpit of a small commuter bike: narrow seat, tank, fork and round headlight.
const bike = () => `<path d="M23 171H116L123 178H23ZM126 177Q139 163 165 164L187 179Q167 190 135 185Z" fill="${SLATE}"/><path d="M192 190L207 138L198 130L191 124M207 138L216 143L205 190M180 133L199 120H219M210 120L207 107"/><circle cx="207" cy="103" r="5" fill="${SLATE}"/><path d="M222 139Q230 147 222 155H214V139Z" fill="${SLATE}"/><path d="M178 131L188 126L196 129L194 136L184 138" fill="${SLATE}"/>`;


export const ART = {
  'helmet-on': () => svg(place(120, 14, 1.27, riderBust(true))),
  'strap-closed': () => svg(chin() + chinStrap(true)),
  'vest': () => svg(place(120, 14, 1.27, riderBust() + vest())),
  'boots-gloves': () => svg(place(59, 91, 1, boot() + focus(`<path d="M-27 0H12L13 9H-27Z" fill="${SLATE}"/>`)) + place(172, 48, 1.22, hand())),
  'strap-open': () => svg(chin() + chinStrap(false)),
  'flip-flop': () => svg(`<path d="M28 59H79L88 78V106H25V75ZM29 69H80M27 79H87M26 90H88M25 101H88M36 109L31 123H77M79 128V168H162M78 177H173" fill="${SLATE}"/><circle cx="49" cy="131" r="15" fill="${NAVY}"/><circle cx="49" cy="131" r="5"/><path d="M84 61V68H162V61M19 179H62"/>` + place(123, 132, 1.12, focus(foot())) + `<path d="M33 185H203" stroke-width="1" opacity=".45"/>`),
  'two-helmets': () => svg(place(72, 18, 1, riderBust(false, true))
    + place(153, 34, 1, riderBust()) + bike()),
};
