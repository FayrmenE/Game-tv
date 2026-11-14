'use strict';
/*
 * Память комнаты на весь вечер (пока работает сервер): что уже выпадало —
 * пары «Чужого», слова «Крокодила», фразы «Каракулей», слова «Объясни!» и «Шляпы».
 * Живёт дольше одной партии: «Ещё раз» и новые игры не повторяют уже бывшее,
 * пока не пройден весь набор (тогда круг начинается заново).
 */
const store = new Map();   // код комнаты → Map(ключ → Set)

function used(code, key) {
  if (!store.has(code)) store.set(code, new Map());
  const m = store.get(code);
  if (!m.has(key)) m.set(key, new Set());
  return m.get(key);
}

/** Выбрать элемент, которого ещё не было (keyOf — как узнать элемент). Набор кончился — новый круг. */
function pickFresh(code, key, list, keyOf = (x) => x, rnd = Math.random) {
  const u = used(code, key);
  let free = list.filter((x) => !u.has(keyOf(x)));
  if (!free.length) { u.clear(); free = list.slice(); }
  const x = free[Math.floor(rnd() * free.length)];
  u.add(keyOf(x));
  return x;
}

function forget(code) { store.delete(code); }

module.exports = { used, pickFresh, forget };
