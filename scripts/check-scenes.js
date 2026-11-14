'use strict';
/* Проверка данных: в каждой сцене 24 предмета, ≥6 пар, у всех предметов есть рисунок и переводы. */
const path = require('path');
const ART = require('../public/js/art.js');
require('../public/js/art2.js');
const HINTS = require('../data/hints.js');
const { I18N } = require('../public/js/i18n.js');
const { scenes } = require(path.join(__dirname, '..', 'data', 'scenes.json'));

const errors = [];
const langs = Object.keys(I18N);
for (const s of scenes) {
  const ids = s.items.map((i) => i.id);
  if (s.items.length !== 24) errors.push(`${s.id}: ${s.items.length} предметов вместо 24`);
  if (new Set(ids).size !== ids.length) errors.push(`${s.id}: повторяющиеся id`);
  const nums = s.items.map((i) => i.num).sort((a, b) => a - b);
  if (nums.some((n, k) => n !== k + 1)) errors.push(`${s.id}: номера должны быть 1..24`);
  if (s.pairs.length < 6) errors.push(`${s.id}: пар ${s.pairs.length} < 6`);
  for (const p of s.pairs) for (const id of p) if (!ids.includes(id)) errors.push(`${s.id}: пара ссылается на ${id}`);
  for (const l of langs) if (!I18N[l][s.nameKey]) errors.push(`${l}: нет перевода ${s.nameKey}`);
  for (const it of s.items) {
    if (!ART.ITEMS[it.id]) errors.push(`${s.id}: нет рисунка ${it.id}`);
    if (!HINTS[it.id]) errors.push(`${s.id}: нет подсказок для ботов ${it.id}`);
    for (const l of langs) if (!I18N[l][it.nameKey]) errors.push(`${l}: нет перевода ${it.nameKey}`);
  }
  console.log(`✓ ${s.id}: ${s.items.length} предметов, ${s.pairs.length} пар`);
}
const ru = Object.keys(I18N.ru), en = Object.keys(I18N.en);
for (const k of ru) if (!en.includes(k)) errors.push(`en: нет ключа ${k}`);
for (const k of en) if (!ru.includes(k)) errors.push(`ru: нет ключа ${k}`);
// Французский: все ключи, кроме удалённой «Телепатии» (для неё есть запасной английский)
for (const k of ru) if (!(k in I18N.fr) && !/^(tele\.|title\.tele\.|rules\.telepathy|game\.telepathy)/.test(k)) errors.push(`fr: нет ключа ${k}`);
// Подстановки {name} и т.п. должны совпадать во всех языках
for (const l of ['en', 'fr']) for (const k of Object.keys(I18N[l])) {
  const ph = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join();
  if (I18N.ru[k] != null && ph(I18N.ru[k]) !== ph(I18N[l][k])) errors.push(`${l}: подстановки в ${k} не совпадают с ru`);
}
// Подсказки ботов «Чужого» и фразы «Каракулей» — на всех языках
const PHR = require('../data/phrases.js');
for (const [id, h] of Object.entries(HINTS)) for (const l of ['ru', 'en', 'fr']) if (!h[l] || h[l].length !== 3) errors.push(`hints ${id}: нет 3 слов ${l}`);
for (const part of ['combos', 'words']) for (const l of ['ru', 'en', 'fr']) {
  if (PHR[part][l].length !== PHR[part].ru.length) errors.push(`phrases ${part}.${l}: ${PHR[part][l].length} вместо ${PHR[part].ru.length}`);
}
// Словари Крокодила: по 150 слов на уровень, без повторов
const WORDS = require('../data/words.js');
for (const l of ['ru', 'en', 'fr']) {
  const all = [];
  for (const lvl of ['easy', 'medium', 'hard']) {
    const list = WORDS[l][lvl];
    if (list.length !== 150) errors.push(`words ${l}.${lvl}: ${list.length} слов вместо 150`);
    all.push(...list);
  }
  if (new Set(all).size !== all.length) errors.push(`words ${l}: есть повторы`);
  console.log(`✓ словарь ${l}: ${all.length} слов`);
}
// Морской бой: случайная расстановка всегда корректна
const BS = require('../games/battleship.js');
for (let i = 0; i < 200; i++) if (!BS.validFleet(BS.randomFleet())) { errors.push('battleship: неверная случайная расстановка'); break; }
console.log('✓ морской бой: расстановка');
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('Всё в порядке.');
