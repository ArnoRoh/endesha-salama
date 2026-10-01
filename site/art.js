// Compressed comic illustrations. Keep every picture in the offline SHELL.
const names = [
  'bike-check', 'tyre-pressure', 'brake-test', 'lights-check', 'weak-brakes', 'chain-fuel',
  'helmet-on', 'strap-closed', 'vest', 'boots-gloves', 'strap-open', 'flip-flop', 'two-helmets',
  'steady-speed', 'following-gap', 'wet-road', 'night-ride', 'blind-overtake', 'junction-stop',
  'one-passenger', 'passenger-helmet', 'secure-load', 'three-passengers', 'wide-load', 'passenger-footrests',
  'refuse-alcohol', 'park-to-phone', 'rest-break', 'phone-riding', 'two-beers', 'safe-rest',
  'warn-traffic', 'emergency-call', 'leave-helmet', 'cloth-pressure', 'neck-still', 'location-call',
];

export const ART_FILES = names.map((name) => `art/${name}.webp`);
export const ART = Object.fromEntries(names.map((name, i) => [name, () =>
  `<img class="art" src="${ART_FILES[i]}" width="480" height="400" alt="" aria-hidden="true" decoding="async">`,
]));
