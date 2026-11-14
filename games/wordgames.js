'use strict';
/*
 * «Объясни!» (opts.mode = 'alias') и «Шляпа» (opts.mode = 'hat') — командные игры на объяснение слов.
 *
 *  teams  → хост делит игроков на команды (2–4), может переставлять, жмёт «Начать»
 *  round  → (Шляпа) заставка тура: объясни / одно слово / жесты / нарисуй
 *  ready  → «Объясняет Аня (Красные)» — объясняющий жмёт «Поехали!» (или сам через 15 с)
 *  turn   → таймер; слово видит объясняющий и соперники-контролёры, его команда угадывает вслух;
 *           кнопки «Угадали» / «Пропуск»; в туре «нарисуй» — рисунок на ТВ
 *  last   → (Объясни!) последнее слово после звонка: кто его угадал — любая команда или никто
 *  review → список слов хода, объясняющий может исправить ошибку; потом очки
 *  final  → итоги
 *
 * Своя база слов: lib/wordbase.js (≥5000 на язык); в одной комнате слова не повторяются.
 * Логика очков и шляпы — чистые функции в words-logic.js (тесты: test/words.test.js).
 */
const L = require('./words-logic');
const WB = require('../lib/wordbase');
const { applyOps } = require('../lib/strokes');
const { pick, randInt, shuffle } = require('../lib/util');

const HAT_MODES = ['explain', 'oneword', 'gestures', 'draw'];
const TEAM_COLORS = ['#ff595e', '#1982c4', '#8ac926', '#ffca3a'];
const T = { ready: 15, last: 10, review: 12, round: 6, final: 8 };

function create(api, opts) {
  const mode = opts.mode === 'hat' ? 'hat' : 'alias';
  const S = api.settings;
  const lang = ['en', 'fr'].includes(S.lang) ? S.lang : 'ru';
  const base = WB.words(lang);
  const used = require('../lib/session').used(api.code, 'words:' + lang);
  const turnSec = mode === 'alias' ? ([30, 45, 60, 90].includes(S.aliasTime) ? S.aliasTime : 60)
    : ([30, 45, 60, 90].includes(S.hatTime) ? S.hatTime : 45);
  const target = [20, 30, 50, 70].includes(S.aliasTarget) ? S.aliasTarget : 30;
  const penalty = S.aliasPenalty !== false;
  const rounds = S.hatRounds === 3 ? 3 : 4;
  const sameWords = !!S.hatSame;
  const perRound = [20, 30, 40, 50].includes(S.hatWords) ? S.hatWords : 30;

  const G = {
    phase: 'teams', teams: L.splitTeams(api.players.filter((p) => p.connected).map((p) => p.id), 2),
    scores: [], order: { turn: 0, cursor: [] }, turnsDone: 0,
    cur: null, round: 0, pool: [], hatWords: [], canvas: { strokes: [] },
    stats: { explained: {}, skips: {}, byMode: {} }, end: null
  };
  const memberOf = {};            // id → индекс команды (чтобы вернувшийся встал на место)
  let jobs = [];
  const later = (ms, fn) => { const c = api.later(ms, fn); jobs.push(c); return c; };
  const cancelJobs = () => { jobs.forEach((c) => c()); jobs = []; };
  const ts = Math.max(api.timeScale, 0.05);
  const live = (ids) => ids.filter((id) => api.getPlayer(id));
  const roundMode = () => (mode === 'hat' ? HAT_MODES[G.round - 1] : 'explain');
  const wordsFor = () => (roundMode() === 'draw' ? base.concrete : base.all);
  const teamOf = (id) => G.teams.findIndex((t) => t.includes(id));
  const remember = () => G.teams.forEach((t, i) => t.forEach((id) => { memberOf[id] = i; }));

  /* ------------------------------ команды ------------------------------ */

  function resplit(n) {
    if (G.phase !== 'teams') return null;
    G.teams = L.splitTeams(G.teams.flat().filter((id) => api.getPlayer(id)), n);
    api.sync();
    return null;
  }
  function move(id) {
    if (G.phase !== 'teams') return null;
    const from = teamOf(id);
    if (from < 0) return null;
    G.teams[from] = G.teams[from].filter((x) => x !== id);
    G.teams[(from + 1) % G.teams.length].push(id);
    api.sync();
    return null;
  }
  function begin() {
    if (G.phase !== 'teams') return null;
    G.teams = G.teams.map(live).filter((t) => t.length);
    if (!L.teamsValid(G.teams)) { api.sync(); return { key: 'err.teams' }; }
    G.scores = G.teams.map(() => 0);
    G.order = { turn: 0, cursor: G.teams.map(() => 0) };
    remember();
    if (mode === 'hat') return nextRound();
    readyTurn();
    return null;
  }

  /* ------------------------------ ходы ------------------------------ */

  function nextRound() {
    if (G.round >= rounds) return finale();
    G.round++;
    if (G.round === 1 || !sameWords || roundMode() === 'draw' || !G.hatWords.length) {
      G.hatWords = L.dealWords(wordsFor(), perRound, used);
    }
    G.pool = shuffle(G.hatWords.slice());
    G.phase = 'round';
    api.sfx('reveal');
    api.setTimer(T.round, readyTurn);
    api.sync();
    return null;
  }

  function readyTurn() {
    cancelJobs();
    G.teams = G.teams.map(live);
    if (G.teams.filter((t) => t.length).length < 2) return finale();
    let r;
    for (let guard = 0; guard < 20; guard++) {     // пропускаем опустевшие команды
      r = L.nextTurn(G.teams, G.order);
      G.order = r.order;
      if (r.explainer) break;
    }
    G.cur = { team: r.team, explainer: r.explainer, results: [], word: null, queue: [], startPool: [], last: null };
    G.phase = 'ready';
    api.setTimer(T.ready, startTurn);
    api.sync();
    return null;
  }

  function nextWord() {
    const c = G.cur;
    if (mode === 'alias') c.word = L.dealWords(base.all, 1, used)[0];
    else c.word = c.queue.length ? c.queue[0] : null;
  }

  function startTurn() {
    if (G.phase !== 'ready') return;
    const c = G.cur;
    if (mode === 'hat') { c.startPool = G.pool.slice(); c.queue = G.pool.slice(); }
    nextWord();
    if (!c.word) return endTurn();
    G.canvas = { strokes: [] };
    if (roundMode() === 'draw') { api.toTv('words:full', { strokes: [] }); api.toPlayer(c.explainer, 'words:full', { strokes: [] }); }
    G.phase = 'turn';
    api.sfx('whoosh');
    api.setTimer(turnSec, timeUp);
    api.sync();
  }

  function answer(ok) {
    const c = G.cur;
    if (G.phase !== 'turn' || !c.word) return;
    c.results.push({ word: c.word, ok });
    api.sfx(ok ? 'ok' : 'err');
    if (mode === 'hat') {
      if (ok) c.queue.shift(); else c.queue.push(c.queue.shift());
      if (!c.queue.length) return endTurn();       // шляпа опустела — тур окончен
    }
    nextWord();
    if (roundMode() === 'draw') { G.canvas = { strokes: [] }; api.toTv('words:full', { strokes: [] }); api.toPlayer(c.explainer, 'words:full', { strokes: [] }); }
    api.sync();
  }

  function timeUp() {
    if (G.phase !== 'turn') return;
    api.sfx('boom');
    if (mode === 'alias' && G.cur.word) {
      G.cur.last = { word: G.cur.word, by: null };
      G.phase = 'last';
      api.setTimer(T.last, () => setLast(null));
      return api.sync();
    }
    endTurn();
  }

  function setLast(by) {
    if (G.phase !== 'last') return;
    G.cur.last.by = by;
    endTurn();
  }

  function endTurn() {
    if (G.phase !== 'turn' && G.phase !== 'last' && G.phase !== 'ready') return;
    G.cur.word = null;
    G.phase = 'review';
    api.setTimer(T.review, applyTurn);
    api.sync();
  }

  function toggle(i) {
    if (G.phase !== 'review') return;
    const list = reviewList();
    const it = list[i];
    if (!it) return;
    // меняем все записи этого слова: угадано ↔ не угадано
    const want = !it.ok;
    G.cur.results = G.cur.results.filter((r) => r.word !== it.word).concat([{ word: it.word, ok: want }]);
    G.cur.results.sort((a, b) => list.findIndex((x) => x.word === a.word) - list.findIndex((x) => x.word === b.word));
    api.sync();
  }

  /** Слова хода без повторов: угадано, если хоть раз угадали */
  function reviewList() {
    const out = [];
    for (const r of G.cur ? G.cur.results : []) {
      const e = out.find((x) => x.word === r.word);
      if (e) e.ok = e.ok || r.ok; else out.push({ word: r.word, ok: r.ok });
    }
    return out;
  }

  function applyTurn() {
    if (G.phase !== 'review') return;
    const c = G.cur, list = reviewList(), n = G.teams.length;
    const delta = mode === 'alias' ? L.aliasTurnDelta(n, c.team, list, c.last, penalty) : L.hatTurnDelta(n, c.team, list);
    G.scores = L.addScores(G.scores, delta);
    const got = list.filter((r) => r.ok).length;
    G.stats.explained[c.explainer] = (G.stats.explained[c.explainer] || 0) + got;
    G.stats.skips[c.explainer] = (G.stats.skips[c.explainer] || 0) + list.filter((r) => !r.ok).length;
    const m = roundMode();
    G.stats.byMode[m] = G.stats.byMode[m] || {};
    G.stats.byMode[m][c.explainer] = (G.stats.byMode[m][c.explainer] || 0) + got;
    G.turnsDone++;
    if (mode === 'alias') {
      if (L.aliasOver(G.scores, G.turnsDone, target)) return finale();
      return readyTurn();
    }
    G.pool = L.hatAfterTurn(c.startPool, list);
    if (!G.pool.length) return nextRound();
    readyTurn();
  }

  /* ------------------------------ итоги ------------------------------ */

  function finale() {
    cancelJobs();
    G.phase = 'final';
    G.cur = null;
    api.sfx('win');
    api.setTimer(T.final, finish);
    api.sync();
    return null;
  }

  function best(obj) {
    const e = Object.entries(obj || {}).filter(([id, v]) => v > 0 && api.getPlayer(id)).sort((a, b) => b[1] - a[1])[0];
    return e || null;
  }

  function finish() {
    const teams = G.teams.map((ids, i) => ({ key: String(i), name: 'words.team.' + i, color: TEAM_COLORS[i], ids: live(ids), score: G.scores[i] || 0 }))
      .filter((t) => t.ids.length);
    const scores = {};
    teams.forEach((t) => t.ids.forEach((id) => { scores[id] = t.score; }));
    const ranking = L.teamRanking(teams.map((t) => t.score)).map((g) => g.flatMap((i) => teams[i].ids));
    const ex = best(G.stats.explained), mime = best(G.stats.byMode.gestures), art = best(G.stats.byMode.draw);
    api.finish({
      ranking, scores, teams: teams.slice().sort((a, b) => b.score - a.score),
      titles: [
        ex && { key: 'title.words.explainer', playerId: ex[0], vars: { n: ex[1] } },
        mode === 'hat' && mime && { key: 'title.words.mime', playerId: mime[0], vars: { n: mime[1] } },
        mode === 'hat' && art && { key: 'title.words.artist', playerId: art[0], vars: { n: art[1] } }
      ]
    });
  }

  /* ------------------------------ представления ------------------------------ */

  function common() {
    const c = G.cur;
    const v = {
      mode, phase: G.phase, teams: G.teams.map(live), colors: TEAM_COLORS, scores: G.scores,
      target, turnSec, round: G.round, rounds, roundMode: roundMode(), penalty,
      poolLeft: mode === 'hat' ? (G.phase === 'turn' && c ? c.queue.length : G.pool.length) : null,
      perRound, sameWords: sameWords && roundMode() !== 'draw' && G.round > 1
    };
    if (c) {
      Object.assign(v, { team: c.team, explainer: c.explainer });
      const list = reviewList();
      // угаданные слова видны всем сразу; пропущенные — только на разборе
      v.guessed = list.filter((r) => r.ok).map((r) => r.word);
      v.skipped = list.filter((r) => !r.ok).length;
      if (G.phase === 'review') { v.review = list; v.last = c.last; }
      if (G.phase === 'last') v.lastWord = c.last.word;
    }
    return v;
  }

  return {
    start() { api.sync(); },
    action(player, type, data) {
      const c = G.cur, me = player.id;
      if (type === 'draw') {
        if (G.phase !== 'turn' || !c || c.explainer !== me || roundMode() !== 'draw') return;
        const out = applyOps(G.canvas, data.ops);
        if (out.length) api.toTv('words:ops', { ops: out });
        return;
      }
      if (type === 'pick' && G.phase === 'teams') {     // игрок сам переходит в команду
        const to = data.team | 0, from = teamOf(me);
        if (from < 0 || to === from || !G.teams[to]) return;
        G.teams[from] = G.teams[from].filter((x) => x !== me);
        G.teams[to].push(me);
        return api.sync();
      }
      if (!c || c.explainer !== me) return;
      if (type === 'go') startTurn();
      else if (type === 'ok') answer(true);
      else if (type === 'skip') answer(false);
      else if (type === 'last') setLast(data.team == null || data.team < 0 ? null : data.team | 0);
      else if (type === 'toggle') toggle(data.i | 0);
      else if (type === 'done') applyTurn();
    },
    host(type, data) {
      if (type === 'words:teams') return resplit(data.n | 0);
      if (type === 'words:move') return move(data.playerId);
      if (type === 'words:start') return begin();
      if (type === 'words:skipTurn' && G.phase === 'ready') { startTurn(); return null; }
      return null;
    },
    tvView: common,
    playerView(p) {
      const v = common();
      v.me = p.id;
      v.myTeam = teamOf(p.id);
      if (v.myTeam < 0) v.spectator = G.phase !== 'teams';
      const c = G.cur;
      // слово видит объясняющий и соперники (контролёры), но не его команда
      if (c && (G.phase === 'turn' || G.phase === 'last') && v.myTeam >= 0 && (p.id === c.explainer || v.myTeam !== c.team)) {
        v.word = G.phase === 'turn' ? c.word : c.last.word;
      }
      return v;
    },
    join(p) {
      if (teamOf(p.id) >= 0 || G.phase === 'final') return;
      if (G.phase === 'teams') {
        const small = G.teams.reduce((a, t, i) => (t.length < G.teams[a].length ? i : a), 0);
        G.teams[small].push(p.id);
      } else if (memberOf[p.id] != null && G.teams[memberOf[p.id]]) G.teams[memberOf[p.id]].push(p.id);
      if (G.cur && G.cur.explainer === p.id && roundMode() === 'draw') later(300, () => api.toPlayer(p.id, 'words:full', { strokes: G.canvas.strokes }));
      api.sync();
    },
    tvJoin(socket) { if (roundMode() === 'draw') socket.emit('words:full', { strokes: G.canvas.strokes }); },
    leave(id) {
      const t = teamOf(id);
      if (t >= 0) G.teams[t] = G.teams[t].filter((x) => x !== id);
      if (G.phase === 'teams') return api.sync();
      if (G.phase === 'final') return;
      if (G.teams.filter((x) => x.length).length < 2) return finale();
      if (G.cur && G.cur.explainer === id) {
        if (G.phase === 'ready') return readyTurn();
        if (G.phase === 'turn' || G.phase === 'last') return endTurn();
      }
      api.sync();
    },
    bot(p) {
      const c = G.cur;
      if (!c || c.explainer !== p.id) return;
      const m = p.memo, key = G.turnsDone + ':' + G.phase + ':' + c.results.length;
      if (m[key]) return;
      m[key] = true;
      if (G.phase === 'ready') later(randInt(1200, 3000) * ts, () => api.act(p, 'go'));
      else if (G.phase === 'turn') {
        if (roundMode() === 'draw') later(300 * ts, () => api.act(p, 'draw', { ops: [{ o: 's', id: 'b' + c.results.length, c: randInt(0, 5), w: 0, p: [randInt(100, 900), randInt(100, 900), randInt(100, 900), randInt(100, 900)] }, { o: 'end', id: 'b' + c.results.length }] }));
        later(randInt(2500, 7000) * ts, () => api.act(p, Math.random() < 0.75 ? 'ok' : 'skip'));
      } else if (G.phase === 'last') later(randInt(1500, 4000) * ts, () => api.act(p, 'last', { team: Math.random() < 0.5 ? c.team : pick([-1, (c.team + 1) % G.teams.length]) }));
      else if (G.phase === 'review') later(randInt(1500, 3000) * ts, () => api.act(p, 'done'));
    },
    destroy() { cancelJobs(); }
  };
}

module.exports = { create };
