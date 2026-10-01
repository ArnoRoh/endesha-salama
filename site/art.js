// Pictures drawn as small inline SVG (flat, adult, road-safety-poster style). Animation lives in style.css.
// A step uses one with "art": "<name>" in lessons.json; steps without it keep their emoji "pic".
const head = (strap) => `
  <circle cx="115" cy="100" r="92" fill="#0f2a44" opacity=".07"/>
  <path d="M20 200C22 165 50 158 90 160H130C175 160 210 168 222 200Z" fill="#35465a"/>
  <path d="M20 200C22 180 30 170 44 165L52 200ZM222 200C220 180 212 172 198 166L190 200Z" fill="#ffb300"/>
  <path d="M92 124L86 166Q110 176 134 166L128 124Z" fill="#7a4a2e"/>
  <g class="helmet">
    <path d="M58 122C48 100 50 60 78 40C100 24 142 24 164 48C178 64 182 92 182 112C182 126 176 136 162 136L118 134C100 134 80 134 68 130C62 128 60 126 58 122Z" fill="#c62828"/>
    <path d="M62 72C80 36 130 28 160 52" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/>
    <path d="M118 62C138 56 160 60 172 74C176 86 176 96 174 102L128 100C120 92 116 76 118 62Z" fill="#0b1c2e"/>
    <path d="M128 68C142 64 156 68 163 76" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".45"/>
    <path d="M150 116H172M150 123H172" stroke="#7b1515" stroke-width="3" stroke-linecap="round"/>
    ${strap}
  </g>`;

// Chin strap fastened: a band under the chin, buckle clicks shut, green tick.
const closed = `
    <path d="M98 132C100 152 140 154 168 138" fill="none" stroke="#1b1b1b" stroke-width="7" stroke-linecap="round"/>
    <g class="click"><rect x="126" y="143" width="16" height="13" rx="3" fill="#cfd6dd" stroke="#6b7782" stroke-width="2"/></g>`;

// Chin strap loose: both halves dangle and swing, and the helmet rocks up and back.
const open = `
    <g class="swing a"><path d="M98 132L102 166" stroke="#1b1b1b" stroke-width="7" stroke-linecap="round"/><rect x="95" y="164" width="14" height="12" rx="3" fill="#cfd6dd" stroke="#6b7782" stroke-width="2"/></g>
    <g class="swing b"><path d="M156 138L160 160" stroke="#1b1b1b" stroke-width="7" stroke-linecap="round"/><rect x="154" y="158" width="12" height="9" rx="2" fill="#cfd6dd" stroke="#6b7782" stroke-width="2"/></g>`;

const svg = (body) => `<svg class="art" viewBox="0 0 240 200" role="img" aria-hidden="true">${body}</svg>`;
const tick = `<g class="badge"><circle cx="206" cy="34" r="20" fill="#1b8a3a"/><path d="M196 34L204 42L218 26" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></g>`;

export const ART = {
  'strap-closed': () => svg(head(closed) + tick),
  'strap-open': () => svg(head(open).replace('class="helmet"', 'class="helmet loose"')),
};
