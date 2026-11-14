'use strict';
const test = require('node:test');
const assert = require('node:assert');
const L = require('../games/words-logic');
const WB = require('../lib/wordbase');

test('splitTeams: по кругу, не больше половины игроков', () => {
  assert.deepStrictEqual(L.splitTeams(['a', 'b', 'c', 'd', 'e'], 2), [['a', 'c', 'e'], ['b', 'd']]);
  assert.strictEqual(L.splitTeams(['a', 'b', 'c', 'd', 'e'], 4).length, 2);   // 5 игроков → максимум 2 команды
  assert.strictEqual(L.splitTeams(['a', 'b', 'c', 'd', 'e', 'f'], 3).length, 3);
  assert.ok(L.teamsValid([['a', 'b'], ['c', 'd']]));
  assert.ok(!L.teamsValid([['a', 'b'], ['c']]));
  assert.ok(!L.teamsValid([['a', 'b', 'c']]));
});

test('nextTurn: команды по очереди, объясняющие внутри команды меняются', () => {
  const teams = [['a1', 'a2'], ['b1', 'b2', 'b3']];
  let order = { turn: 0, cursor: [0, 0] }, seq = [];
  for (let i = 0; i < 6; i++) { const r = L.nextTurn(teams, order); seq.push(r.explainer); order = r.order; }
  assert.deepStrictEqual(seq, ['a1', 'b1', 'a2', 'b2', 'a1', 'b3']);
});

test('aliasTurnDelta: +1 угаданное, −1 пропуск (если включён штраф), последнее слово любой команде', () => {
  const res = [{ word: 'кот', ok: true }, { word: 'дом', ok: false }, { word: 'сыр', ok: true }];
  assert.deepStrictEqual(L.aliasTurnDelta(2, 0, res, null, true), [1, 0]);
  assert.deepStrictEqual(L.aliasTurnDelta(2, 0, res, null, false), [2, 0]);
  assert.deepStrictEqual(L.aliasTurnDelta(3, 1, res, { word: 'лес', by: 2 }, true), [0, 1, 1]);
  assert.deepStrictEqual(L.aliasTurnDelta(2, 1, [], { word: 'лес', by: null }, true), [0, 0]);
  assert.deepStrictEqual(L.addScores([0, 3], [-2, 1]), [0, 4]);   // ниже нуля не уходит
});

test('aliasOver: цель достигнута и у всех поровну ходов', () => {
  assert.ok(!L.aliasOver([30, 10], 1, 30));        // вторая команда ещё не ходила
  assert.ok(L.aliasOver([30, 10], 2, 30));
  assert.ok(!L.aliasOver([29, 28], 2, 30));
  assert.ok(L.aliasOver([5, 31, 2], 3, 30));
  assert.deepStrictEqual(L.teamRanking([5, 9, 5]), [[1], [0, 2]]);
});

test('hatAfterTurn: угаданные уходят, пропущенные — в конец шляпы', () => {
  const pool = ['a', 'b', 'c', 'd', 'e'];
  const res = [{ word: 'a', ok: true }, { word: 'b', ok: false }, { word: 'c', ok: true }];
  assert.deepStrictEqual(L.hatAfterTurn(pool, res), ['d', 'e', 'b']);
  assert.deepStrictEqual(L.hatAfterTurn(['x'], [{ word: 'x', ok: true }]), []);
  assert.deepStrictEqual(L.hatTurnDelta(3, 2, res), [0, 0, 2]);
});

test('dealWords: без повторов, по кругу после исчерпания', () => {
  const used = new Set();
  const a = L.dealWords(['1', '2', '3', '4'], 3, used, () => 0);
  assert.strictEqual(new Set(a).size, 3);
  const b = L.dealWords(['1', '2', '3', '4'], 1, used, () => 0);
  assert.ok(!a.includes(b[0]));
  const c = L.dealWords(['1', '2', '3', '4'], 3, used, () => 0);   // осталось 0 свободных → новый круг
  assert.strictEqual(c.length, 3);
});

test('база слов: ≥5000 на каждом языке, есть «рисуемые»', () => {
  for (const l of WB.LANGS) {
    const w = WB.words(l);
    assert.ok(w.all.length >= 5000, l + ': ' + w.all.length);
    assert.ok(w.concrete.length >= 3000, l + ' concrete: ' + w.concrete.length);
    assert.strictEqual(new Set(w.all.map((x) => x.toLowerCase())).size, w.all.length);
  }
});
