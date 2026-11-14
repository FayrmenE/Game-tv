'use strict';
/*
 * «Объясни!» и «Шляпа» — чистая логика без сокетов и таймеров (тесты: test/words.test.js).
 * Команды — массив массивов id игроков. Счёт — массив чисел по индексу команды.
 */

/** Разбить игроков на n команд по кругу: 1-й в А, 2-й в Б, … */
function splitTeams(ids, n) {
  const k = Math.max(2, Math.min(n | 0, Math.floor(ids.length / 2) || 2));
  const teams = Array.from({ length: k }, () => []);
  ids.forEach((id, i) => teams[i % k].push(id));
  return teams;
}

/** Можно ли начинать: не меньше двух команд, в каждой не меньше двух игроков */
function teamsValid(teams) {
  return teams.length >= 2 && teams.every((t) => t.length >= 2);
}

/**
 * Очередь ходов: команды ходят по кругу, внутри команды объясняющий меняется.
 * order = { turn: номер хода, cursor: [для каждой команды — сколько раз она уже ходила] }
 * → { team, explainer, order: новое состояние }
 */
function nextTurn(teams, order) {
  const team = order.turn % teams.length;
  const members = teams[team];
  const explainer = members[(order.cursor[team] || 0) % members.length];
  const cursor = order.cursor.slice();
  cursor[team] = (cursor[team] || 0) + 1;
  return { team, explainer, order: { turn: order.turn + 1, cursor } };
}

/**
 * Очки за ход «Объясни!». results: [{ word, ok: bool }] — угаданные и пропущенные,
 * last: null | { word, by: индекс команды | null } — «последнее слово» после звонка
 * (его может угадать любая команда). → массив прибавок по командам
 */
function aliasTurnDelta(nTeams, team, results, last, skipPenalty) {
  const d = new Array(nTeams).fill(0);
  for (const r of results) {
    if (r.ok) d[team] += 1;
    else if (skipPenalty) d[team] -= 1;
  }
  if (last && last.by != null && last.by >= 0 && last.by < nTeams) d[last.by] += 1;
  return d;
}

/** Сложить счёт (не ниже нуля) */
function addScores(scores, delta) {
  return scores.map((s, i) => Math.max(0, s + (delta[i] || 0)));
}

/**
 * Конец «Объясни!»: кто-то дошёл до цели, и все команды сделали поровну ходов.
 * turnsDone — сколько ходов сыграно всего.
 */
function aliasOver(scores, turnsDone, target) {
  const n = scores.length;
  return turnsDone > 0 && turnsDone % n === 0 && Math.max(...scores) >= target;
}

/** Места команд: группы индексов по убыванию счёта */
function teamRanking(scores) {
  const idx = scores.map((_, i) => i).sort((a, b) => scores[b] - scores[a]);
  const groups = [];
  for (const i of idx) {
    const g = groups[groups.length - 1];
    if (g && scores[g[0]] === scores[i]) g.push(i); else groups.push([i]);
  }
  return groups;
}

/* ------------------------------ «Шляпа» ------------------------------ */

/**
 * После хода в «Шляпе»: из шляпы уходят угаданные слова, пропущенные и недообъяснённое
 * возвращаются в конец (в том же порядке). startPool — шляпа на начало хода.
 */
function hatAfterTurn(startPool, results) {
  const guessed = new Set(results.filter((r) => r.ok).map((r) => r.word));
  const skipped = results.filter((r) => !r.ok).map((r) => r.word);
  const skippedSet = new Set(skipped);
  const rest = startPool.filter((w) => !guessed.has(w) && !skippedSet.has(w));
  return rest.concat(skipped.filter((w) => !guessed.has(w)));
}

/** Очки за ход «Шляпы»: +1 за каждое угаданное */
function hatTurnDelta(nTeams, team, results) {
  const d = new Array(nTeams).fill(0);
  d[team] = results.filter((r) => r.ok).length;
  return d;
}

/**
 * Взять n слов из списка, не повторяя использованные (used — Set).
 * Если неиспользованных не хватает — used очищается (база пошла по второму кругу).
 */
function dealWords(list, n, used, rnd = Math.random) {
  let free = list.filter((w) => !used.has(w));
  if (free.length < n) { used.clear(); free = list.slice(); }
  const out = [];
  for (let i = 0; i < n && free.length; i++) {
    const j = Math.floor(rnd() * free.length);
    out.push(free[j]);
    used.add(free[j]);
    free[j] = free[free.length - 1];
    free.pop();
  }
  return out;
}

module.exports = {
  splitTeams, teamsValid, nextTurn, aliasTurnDelta, addScores, aliasOver, teamRanking,
  hatAfterTurn, hatTurnDelta, dealWords
};
