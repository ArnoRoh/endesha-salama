// Pictures drawn as small inline SVG (flat, adult, road-safety-poster style). Animation lives in style.css.
// A step uses one with "art": "<name>" in lessons.json; steps without it keep their emoji "pic".
const SKIN = '#7a4a2e', STRAP = '#1b1b1b', METAL = 'fill="#cfd6dd" stroke="#6b7782" stroke-width="2"';
const BODY = 'M20 200C22 165 50 158 90 160H130C175 160 210 168 222 200Z';

const bg = '<circle cx="115" cy="100" r="92" fill="#0f2a44" opacity=".07"/>';
const tick = '<g class="badge"><circle cx="206" cy="34" r="20" fill="#1b8a3a"/><path d="M196 34L204 42L218 26" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></g>';
const svg = (body) => `<svg class="art" viewBox="0 0 240 200" aria-hidden="true">${body}</svg>`;

const jacket = (col) => `<path d="${BODY}" fill="${col}"/><path d="M20 200C22 180 30 170 44 165L52 200ZM222 200C220 180 212 172 198 166L190 200Z" fill="#ffb300"/>`;
const vest = `<path d="${BODY}" fill="#d7e600"/><g class="shine" stroke="#eef2f5" stroke-width="7"><path d="M44 182H196M40 194H200"/></g><path d="M92 160L110 200L128 160" fill="none" stroke="#a3ad00" stroke-width="3"/>`;

const closedStrap = `<path d="M98 132C100 152 140 154 168 138" fill="none" stroke="${STRAP}" stroke-width="7" stroke-linecap="round"/><g class="click"><rect x="126" y="143" width="16" height="13" rx="3" ${METAL}/></g>`;
const openStrap = `<g class="swing a"><path d="M98 132L102 166" stroke="${STRAP}" stroke-width="7" stroke-linecap="round"/><rect x="95" y="164" width="14" height="12" rx="3" ${METAL}/></g><g class="swing b"><path d="M156 138L160 160" stroke="${STRAP}" stroke-width="7" stroke-linecap="round"/><rect x="154" y="158" width="12" height="9" rx="2" ${METAL}/></g>`;

// Full-face helmet seen from the side, facing right. cls animates the whole helmet.
const helmet = (strap, col = '#c62828', cls = '') => `<g class="helmet ${cls}">
  <path d="M58 122C48 100 50 60 78 40C100 24 142 24 164 48C178 64 182 92 182 112C182 126 176 136 162 136L118 134C100 134 80 134 68 130C62 128 60 126 58 122Z" fill="${col}"/>
  <path d="M62 72C80 36 130 28 160 52" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/>
  <path d="M118 62C138 56 160 60 172 74C176 86 176 96 174 102L128 100C120 92 116 76 118 62Z" fill="#0b1c2e"/>
  <path d="M128 68C142 64 156 68 163 76" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".45"/>
  <path d="M150 116H172M150 123H172" stroke="#000" stroke-width="3" stroke-linecap="round" opacity=".3"/>${strap}</g>`;

const neck = `<path d="M92 124L86 166Q110 176 134 166L128 124Z" fill="${SKIN}"/>`;
const rider = ({ body = jacket('#35465a'), strap = '', col, cls } = {}) => body + neck + helmet(strap, col, cls);

const boot = `<g transform="translate(2 60) scale(.72)"><path d="M72 30H124L128 104C150 108 192 108 198 132V150H70Z" fill="#35465a"/><rect x="66" y="150" width="136" height="16" rx="6" fill="#111"/><path d="M72 62H126M72 82H126" stroke="#ffb300" stroke-width="7"/></g>`;
const glove = `<g transform="translate(154 56) scale(.9)"><g fill="#35465a"><rect x="6" y="8" width="17" height="56" rx="8"/><rect x="25" y="0" width="17" height="64" rx="8"/><rect x="44" y="4" width="17" height="60" rx="8"/><rect x="63" y="14" width="16" height="50" rx="8"/><rect x="4" y="50" width="78" height="56" rx="14"/><rect x="-14" y="62" width="30" height="16" rx="8" transform="rotate(-30 4 70)"/></g><rect x="4" y="58" width="78" height="12" fill="#ffb300"/><rect x="10" y="102" width="66" height="30" rx="6" fill="#1f2b3a"/></g>`;

const flipFlop = `<rect x="80" y="8" width="42" height="104" rx="10" fill="${SKIN}"/><g class="slip"><path d="M82 108C76 122 74 134 80 142H196C208 142 208 132 198 128C184 122 160 120 144 108Z" fill="${SKIN}"/><rect x="72" y="140" width="136" height="10" rx="5" fill="#1565c0"/><path d="M178 140L156 120L132 140" fill="none" stroke="#0d3c7a" stroke-width="7" stroke-linejoin="round"/></g><rect x="60" y="164" width="150" height="10" rx="5" fill="#6b7782"/>`;

const person = (x, y, s, col) => `<g transform="translate(${x} ${y}) scale(${s})">${rider({ strap: closedStrap, col })}</g>`;

export const ART = {
  'helmet-on': () => svg(bg + rider({ cls: 'drop' }) + tick),
  'strap-closed': () => svg(bg + rider({ strap: closedStrap }) + tick),
  'strap-open': () => svg(bg + rider({ strap: openStrap, cls: 'loose' })),
  'vest': () => svg(bg + rider({ body: vest, strap: closedStrap }) + tick),
  'boots-gloves': () => svg(bg + boot + glove + tick),
  'flip-flop': () => svg(bg + flipFlop),
  'two-helmets': () => svg(bg + person(-20, 40, 0.8, '#1565c0') + person(58, 40, 0.8, '#c62828') + tick),
};
