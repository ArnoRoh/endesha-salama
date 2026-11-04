// Every spoken line, one Ogg Opus clip per language. Shared by app.js and scripts/.
export const audioPath = (lang, name) => `audio/${lang}/${name}.ogg`;

export function audioItems(L) {
  return Object.keys(L.langs).flatMap((lang) => {
    const out = [];
    const add = (name, text) => out.push({ lang, name, file: audioPath(lang, name), text });
    L.spoken.forEach((k) => add(`ui-${k}`, L.ui[lang][k]));
    for (const m of L.modules) {
      if (m.hook) add(`${m.id}-hook`, m.hook[lang]);
      if (m.viva) { add(`${m.id}-viva`, m.viva.q[lang]); add(`${m.id}-viva-model`, m.viva.model[lang]); }
      for (const s of m.steps) {
        add(s.id, [s.text[lang], ...(s.options ?? []).map((o) => `${o.id.toUpperCase()}. ${o.text[lang]}`)].join(' '));
        if (s.why) {
          const correct = s.options?.find((o) => o.id === s.answer);
          add(`${s.id}-why`, [correct ? `${correct.id.toUpperCase()}. ${correct.text[lang]}` : '', s.why[lang]].filter(Boolean).join(' '));
        }
      }
    }
    return out;
  });
}
