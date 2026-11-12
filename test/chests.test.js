'use strict';
// Тесты чистой логики «Сундуков»: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../games/chests-logic');

const C = (o) => Object.assign({}, o);
const coins = (v) => ({ kind: 'coins', v });

test('колода: 40 сундуков нужного состава', () => {
  const d = L.makeDeck();
  assert.equal(d.length, 40);
  const cnt = {};
  d.forEach((c) => { const k = L.cardKey(c); cnt[k] = (cnt[k] || 0) + 1; });
  assert.deepEqual(cnt, { '+10': 5, '+20': 5, '+30': 3, '+50': 2, '0': 4, '-10': 5, '-20': 5, '-30': 3, thief: 4, mimic: 4 });
  assert.equal(L.deckComposition().reduce((s, x) => s + x.total, 0), 40);
});

test('ставка ограничена своими монетами и не бывает отрицательной', () => {
  assert.equal(L.clampBid(50, 30), 30);
  assert.equal(L.clampBid(-5, 30), 0);
  assert.equal(L.clampBid('abc', 30), 0);
  assert.equal(L.clampBid(12.7, 30), 12);
});

test('разбор ставок: победитель, ничья, все пас', () => {
  assert.deepEqual(L.resolveBids({ a: 10, b: 25, c: 0 }, 'k'), { type: 'win', winner: 'b', recipient: 'b', price: 25 });
  assert.deepEqual(L.resolveBids({ a: 20, b: 20, c: 5 }, 'k'), { type: 'tie', ids: ['a', 'b'], price: 20 });
  assert.deepEqual(L.resolveBids({ a: 0, b: 0 }, 'k'), { type: 'free', recipient: 'k' });
  assert.deepEqual(L.resolveBids({}, 'k'), { type: 'free', recipient: 'k' });
});

test('победитель платит Смотрителю и получает плюс', () => {
  const r = L.applyRound({ k: 100, a: 100, b: 100 }, 'k', { a: 30, b: 10 }, coins(50), false);
  assert.deepEqual(r.coins, { k: 130, a: 120, b: 100 });
  assert.equal(r.paid, 30); assert.equal(r.keeperGot, 30); assert.equal(r.burned, 0);
});

test('жёсткий режим: Смотрителю половина (вниз), остальное сгорает', () => {
  const r = L.applyRound({ k: 100, a: 100 }, 'k', { a: 25 }, coins(0), true);
  assert.deepEqual(r.coins, { k: 112, a: 75 });
  assert.equal(r.keeperGot, 12); assert.equal(r.burned, 13);
});

test('минус не опускает монеты ниже нуля', () => {
  const r = L.applyRound({ k: 100, a: 20 }, 'k', { a: 15 }, coins(-30), false);
  assert.deepEqual(r.coins, { k: 115, a: 0 });
});

test('ничья: сундук сгорает, никто не платит', () => {
  const r = L.applyRound({ k: 100, a: 100, b: 100 }, 'k', { a: 40, b: 40 }, coins(50), false);
  assert.deepEqual(r.coins, { k: 100, a: 100, b: 100 });
  assert.equal(r.outcome.type, 'tie'); assert.equal(r.recipient, null);
});

test('все пас: Смотритель получает сундук бесплатно', () => {
  const r = L.applyRound({ k: 100, a: 100 }, 'k', { a: 0 }, coins(20), false);
  assert.deepEqual(r.coins, { k: 120, a: 100 });
  const r2 = L.applyRound({ k: 10, a: 100 }, 'k', { a: 0 }, coins(-30), false);
  assert.deepEqual(r2.coins, { k: 0, a: 100 });
});

test('Мимик: победитель платит ставку ещё раз; бесплатно — без эффекта', () => {
  const r = L.applyRound({ k: 100, a: 100 }, 'k', { a: 30 }, { kind: 'mimic' }, false);
  assert.deepEqual(r.coins, { k: 130, a: 40 });
  assert.equal(r.mimicPaid, 30);
  const poor = L.applyRound({ k: 100, a: 50 }, 'k', { a: 40 }, { kind: 'mimic' }, false);
  assert.deepEqual(poor.coins, { k: 140, a: 0 });   // не ниже нуля
  const free = L.applyRound({ k: 100, a: 100 }, 'k', { a: 0 }, { kind: 'mimic' }, false);
  assert.deepEqual(free.coins, { k: 100, a: 100 }); assert.equal(free.mimicPaid, 0);
});

test('Вор: крадёт min(15, монеты); нельзя у себя и у банкрота', () => {
  const r = L.applyRound({ k: 100, a: 100, b: 7 }, 'k', { a: 10 }, { kind: 'thief' }, false);
  assert.equal(r.needThief, true);
  assert.deepEqual(L.thiefTargets(r.coins, 'a').sort(), ['b', 'k']);
  assert.deepEqual(L.applyThief(r.coins, 'a', 'k').coins, { k: 95, a: 105, b: 7 });
  assert.deepEqual(L.applyThief(r.coins, 'a', 'b').coins, { k: 110, a: 97, b: 0 });
  assert.equal(L.applyThief(r.coins, 'a', 'a').stolen, 0);
  assert.equal(L.applyThief({ a: 5, b: 0 }, 'a', 'b').stolen, 0);
});

test('Вор: красть не у кого — эффекта нет', () => {
  const r = L.applyRound({ k: 0, a: 100 }, 'k', { a: 0 }, { kind: 'thief' }, false);
  // бесплатно достался банкроту-Смотрителю, у «a» есть монеты → можно красть
  assert.equal(r.needThief, true);
  const r2 = L.applyRound({ k: 100, a: 30 }, 'k', { a: 30 }, { kind: 'thief' }, false);
  // a заплатил всё, у Смотрителя 130 → красть можно у Смотрителя
  assert.equal(r2.needThief, true);
  const r3 = L.applyRound({ k: 0, a: 10, b: 0 }, 'k', { a: 10 }, { kind: 'thief' }, true);
  // жёсткий режим: k получил 5, a = 0 → вор a может красть только у k
  assert.deepEqual(L.thiefTargets(r3.coins, 'a'), ['k']);
  assert.equal(L.applyRound({ a: 100, b: 0 }, 'a', { b: 0 }, { kind: 'thief' }, false).needThief, false);
});

test('банкрот не ставит, а Смотритель-банкрот оживает от оплаты', () => {
  assert.deepEqual(L.eligibleBidders({ k: 0, a: 0, b: 50 }, 'k', ['k', 'a', 'b']), ['b']);
  const r = L.applyRound({ k: 0, a: 0, b: 50 }, 'k', { b: 20 }, coins(-10), false);
  assert.deepEqual(r.coins, { k: 20, a: 0, b: 20 });
});

test('конец игры: досрочно, ничья, по кругам', () => {
  assert.deepEqual(L.checkEnd({ a: 0, b: 40, c: 0 }, 3, 9), { over: true, reason: 'last', winner: 'b' });
  assert.deepEqual(L.checkEnd({ a: 0, b: 0 }, 3, 9), { over: true, reason: 'draw' });
  assert.deepEqual(L.checkEnd({ a: 10, b: 40 }, 9, 9), { over: true, reason: 'rounds' });
  assert.deepEqual(L.checkEnd({ a: 10, b: 40 }, 4, 9), { over: false });
});

test('рейтинг: монеты, затем заработок Смотрителя', () => {
  assert.deepEqual(L.finalRanking({ a: 50, b: 80, c: 50 }, { a: 10, c: 30 }), [['b'], ['c'], ['a']]);
  assert.deepEqual(L.finalRanking({ a: 50, b: 50 }, { a: 5, b: 5 }), [['a', 'b']]);
});
