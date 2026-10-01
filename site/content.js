// Every spoken line, one Ogg Opus clip per language. Shared by app.js and scripts/.
export const audioPath = (lang, name) => `audio/${lang}/${name}.ogg`;

export function audioItems(L) {
  return Object.keys(L.langs).flatMap((lang) => {
    const out = [];
    const add = (name, text) => out.push({ lang, name, file: audioPath(lang, name), text });
    L.spoken.forEach((k) => add(`ui-${k}`, L.ui[lang][k]));
    for (const m of L.modules)
      for (const s of m.steps) {
        add(s.id, s.text[lang]);
        if (s.why) add(`${s.id}-why`, s.why[lang]);
      }
    return out;
  });
}
