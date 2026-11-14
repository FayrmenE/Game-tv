'use strict';
/*
 * База слов для «Объясни!» и «Шляпы»: data/wordbase/*.txt, строка = «ru|en|fr».
 * Первая строка файла — «# concrete» (можно нарисовать — годится для тура «нарисуй»)
 * или «# abstract». Внутри языка повторы убираются (остаётся первое вхождение).
 */
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'data', 'wordbase');
const LANGS = ['ru', 'en', 'fr'];
let cache = null;

function load() {
  if (cache) return cache;
  const out = {};
  for (const l of LANGS) out[l] = { all: [], concrete: [] };
  const seen = { ru: new Set(), en: new Set(), fr: new Set() };
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.txt')).sort();
  for (const f of files) {
    const lines = fs.readFileSync(path.join(DIR, f), 'utf8').split(/\r?\n/);
    const concrete = /^#\s*concrete/.test(lines[0] || '');
    for (const line of lines) {
      if (!line.trim() || line.startsWith('#')) continue;
      const parts = line.split('|').map((s) => s.trim());
      if (parts.length !== 3) continue;
      LANGS.forEach((l, i) => {
        const w = parts[i], k = w.toLowerCase().replace(/ё/g, 'е');
        if (!w || seen[l].has(k)) return;
        seen[l].add(k);
        out[l].all.push(w);
        if (concrete) out[l].concrete.push(w);
      });
    }
  }
  cache = out;
  return out;
}

/** Слова языка: { all: [...], concrete: [...] } */
function words(lang) { const b = load(); return b[lang] || b.ru; }

module.exports = { load, words, LANGS };
