// Compressed comic illustrations. Keep every picture in the offline SHELL.
const names = [
  'bike-check', 'tyre-pressure', 'brake-test', 'lights-check', 'weak-brakes', 'chain-fuel',
  'helmet-on', 'strap-closed', 'vest', 'boots-gloves', 'strap-open', 'flip-flop', 'two-helmets',
  'steady-speed', 'following-gap', 'wet-road', 'night-ride', 'blind-overtake', 'junction-stop',
  'one-passenger', 'passenger-helmet', 'secure-load', 'three-passengers', 'wide-load', 'passenger-footrests',
  'refuse-alcohol', 'park-to-phone', 'rest-break', 'phone-riding', 'two-beers', 'safe-rest',
  'warn-traffic', 'emergency-call', 'leave-helmet', 'cloth-pressure', 'neck-still', 'location-call',
  // HSSE work modules (painted from scripts/art-prompts.json)
  'fire-find-exit', 'gas-chained', 'exit-clear', 'hot-work', 'assembly-point', 'gas-loose',
  'pallets-exit', 'alarm-sounds', 'gas-hiss', 'lift-help', 'lift-knees', 'under-load',
  'pallet-jack', 'tidy-floor', 'bad-lift', 'ibc-foot', 'heavy-sack', 'wet-walkway',
  'safety-shoes', 'goggles', 'ear-muffs', 'work-gloves', 'gear-check', 'shoes-gloves',
  'knife-cut', 'loud-room', 'hot-steam', 'spot-hazard', 'box-falls', 'scan-report',
  'hurt-help', 'first-aid-box', 'loose-fan', 'bee-sting',
  // HSSE expansion: height, power, chem, heat (painted from scripts/art-prompts.json)
  'ladder-check', 'ladder-climb', 'ladder-angle', 'roof-guard', 'tools-secure', 'ladder-cracked', 'carry-climb', 'ladder-reach', 'work-below', 'cable-check', 'wet-switch', 'machine-off', 'lock-tag', 'electrician', 'cable-taped', 'wet-hands', 'lock-removed', 'fan-repair',
  'chem-label', 'chem-store', 'fuel-store', 'spill', 'wash-hands', 'drink-bottle', 'food-store', 'spill-hose', 'chem-eyes', 'heat-signs', 'drink-water', 'shade-rest', 'handwash', 'faint', 'water-break', 'dizzy', 'hands-food', 'collapse',
];

export const ART_FILES = names.map((name) => `art/${name}.webp`);
export const ART = Object.fromEntries(names.map((name, i) => [name, () =>
  `<img class="art" src="${ART_FILES[i]}" width="480" height="400" alt="" aria-hidden="true" decoding="async">`,
]));
