'use strict';
/*
 * «Каракули» (3–8): все одновременно рисуют свою фразу, затем по каждому рисунку
 * остальные придумывают обманные названия, все голосуют, какое настоящее.
 * Очки: угадал правду +2; автору рисунка +1 за каждого угадавшего;
 * автору обманки +1 за каждого, кого он обманул.
 *
 * Секретность: фраза — только автору рисунка; на ТВ — только после раскрытия.
 * Авторы обманок не раскрываются до раскрытия.
 */
const PHRASES_SRC = require('../data/phrases');
const { pick, shuffle, randInt, normalize, levenshtein, rankByScore } = require('../lib/util');

const T = { draw: 80, lie: 45, vote: 25, revealPer: 2.2, revealTail: 5 };
const COLORS = 7;
const MAX_STROKES = 1500;
// Баланс: нашёл правду +300, поверили подписи — автору +200 за каждого.
// Художнику +1 за каждого угадавшего (рисуй понятно!), но если правду нашли ВСЕ —
// рисунок «слишком простой» и художник получает лишь +1 за ход.
const POINTS = { truth: 300, artist: 100, fool: 200, allGuessedArtist: 100 };

function create(api) {
  const lang = (['en', 'fr'].includes(api.settings.lang) ? api.settings.lang : 'ru');
  // единый список: сначала 150 сочетаний, потом 100 слов
  const PHRASES = { [lang]: PHRASES_SRC.combos[lang].concat(PHRASES_SRC.words[lang]) };
  const parts = api.players.filter((p) => p.connected).map((p) => p.id);
  const G = {
    phase: 'draw', round: 1, rounds: parts.length >= 6 ? 1 : 2,
    participants: parts, scores: Object.fromEntries(parts.map((id) => [id, 0])),
    stats: { fooled: {}, truth: {} },
    sheets: {},          // id -> { phrase, idx, strokes, done, swapped }
    queue: [], cur: null // разбираемые рисунки
  };
  const used = new Set();
  let jobs = [];
  const later = (ms, fn) => { const c = api.later(ms, fn); jobs.push(c); return c; };
  const cancelJobs = () => { jobs.forEach((c) => c()); jobs = []; };
  const alive = (ids) => ids.filter((id) => api.getPlayer(id));
  const isPart = (id) => G.participants.includes(id) && api.getPlayer(id);

  /** Все варианты выглядят одинаково: регистр, пробелы, знаки в конце — ничего не выдаёт автора */
  function pretty(text) {
    const t = String(text || '').trim().replace(/\s+/g, ' ').replace(/[.!?…,;:]+$/u, '').toLocaleLowerCase(lang);
    return t ? t[0].toLocaleUpperCase(lang) + t.slice(1) : t;
  }

  function takePhrase() {
    const free = PHRASES[lang].map((_, i) => i).filter((i) => !used.has(i));
    const i = pick(free.length ? free : PHRASES[lang].map((_, k) => k));
    used.add(i);
    return { idx: i, text: pretty(PHRASES[lang][i]) };
  }

  /* ------------------------------ рисование ------------------------------ */

  function startDraw() {
    cancelJobs();
    G.phase = 'draw';
    G.sheets = {};
    for (const id of alive(G.participants)) {
      const ph = takePhrase();
      G.sheets[id] = { phrase: ph.text, idx: ph.idx, strokes: [], done: false, swapped: false };
    }
    api.setTimer(T.draw, startJudging);
    api.sync();
  }

  const clampN = (v) => Math.max(0, Math.min(1000, Math.round(+v) || 0));
  function cleanPts(p) {
    const out = [];
    if (!Array.isArray(p)) return out;
    for (let i = 0; i + 1 < p.length && i < 600; i += 2) out.push(clampN(p[i]), clampN(p[i + 1]));
    return out;
  }

  function draw(player, ops) {
    const sh = G.sheets[player.id];
    if (G.phase !== 'draw' || !sh || sh.done || !Array.isArray(ops)) return;
    for (const op of ops.slice(0, 50)) {
      if (!op || typeof op.o !== 'string') continue;
      if (op.o === 's' && sh.strokes.length < MAX_STROKES) {
        sh.strokes.push({ id: String(op.id).slice(0, 20), c: Math.max(0, Math.min(COLORS - 1, op.c | 0)), w: op.w ? 1 : 0, e: !!op.e, p: cleanPts(op.p) });
      } else if (op.o === 'a') {
        const s = sh.strokes[sh.strokes.length - 1];
        if (s && s.id === String(op.id).slice(0, 20)) s.p.push(...cleanPts(op.p));
      } else if (op.o === 'u') sh.strokes.pop();
      else if (op.o === 'x') sh.strokes = [];
    }
  }

  function swapPhrase(player) {
    const sh = G.sheets[player.id];
    if (G.phase !== 'draw' || !sh || sh.swapped || sh.strokes.length) return;
    const ph = takePhrase();
    Object.assign(sh, { phrase: ph.text, idx: ph.idx, swapped: true });
    api.sync();
  }

  function doneDrawing(player) {
    const sh = G.sheets[player.id];
    if (G.phase !== 'draw' || !sh) return;
    sh.done = true;
    if (alive(G.participants).every((id) => !G.sheets[id] || G.sheets[id].done)) return startJudging();
    api.sync();
  }

  /* ------------------------------ разбор рисунков ------------------------------ */

  function startJudging() {
    if (G.phase !== 'draw') return;
    G.queue = shuffle(Object.keys(G.sheets).filter((id) => api.getPlayer(id)));
    nextDrawing();
  }

  function nextDrawing() {
    cancelJobs();
    while (G.queue.length && !api.getPlayer(G.queue[0])) G.queue.shift();
    if (!G.queue.length) {
      if (G.round < G.rounds) { G.round++; return startDraw(); }
      return finish();
    }
    const artist = G.queue.shift();
    G.cur = { artist, lies: {}, votes: {}, options: null, deltas: {} };
    G.phase = 'lie';
    api.setTimer(T.lie, startVote);
    api.sync();
  }

  const writers = () => alive(G.participants).filter((id) => id !== G.cur.artist);

  function tooClose(text, phrase) {
    const a = normalize(text), b = normalize(phrase);
    if (a === b) return true;
    return b.length >= 6 && levenshtein(a, b) <= 2;
  }

  function lie(player, text) {
    if (G.phase !== 'lie' || !isPart(player.id) || player.id === G.cur.artist) return;
    text = pretty(String(text || '').slice(0, 40));
    if (!text) return;
    if (tooClose(text, G.sheets[G.cur.artist].phrase)) return api.toPlayer(player.id, 'errorMsg', { key: 'doodle.tooClose' });
    G.cur.lies[player.id] = text;
    if (writers().every((id) => G.cur.lies[id])) return startVote();
    api.sync();
  }

  function startVote() {
    if (G.phase !== 'lie') return;
    const c = G.cur, real = G.sheets[c.artist].phrase;
    // Одинаковые обманки сливаются в один вариант (очки — всем авторам)
    const map = new Map();
    map.set(normalize(real), { text: real, real: true, authors: [] });
    for (const [id, text] of Object.entries(c.lies)) {
      const k = normalize(text);
      if (!map.has(k)) map.set(k, { text, real: false, authors: [] });
      map.get(k).authors.push(id);
    }
    // Если обманок мало — добавляем фразы из пула от «дома»
    const need = Math.max(0, 3 - map.size);
    for (let i = 0; i < need; i++) {
      const ph = takePhrase().text;
      if (!map.has(normalize(ph))) map.set(normalize(ph), { text: ph, real: false, authors: [], house: true });
    }
    c.options = shuffle([...map.values()]).map((o, i) => Object.assign(o, { i }));
    G.phase = 'vote';
    api.setTimer(T.vote, reveal);
    api.sync();
  }

  function vote(player, i) {
    const c = G.cur;
    if (G.phase !== 'vote' || !isPart(player.id) || player.id === c.artist) return;
    const o = c.options[i];
    if (!o || o.authors.includes(player.id)) return;
    c.votes[player.id] = i;
    if (writers().every((id) => c.votes[id] != null)) return reveal();
    api.sync();
  }

  function reveal() {
    if (G.phase !== 'vote') return;
    const c = G.cur, d = {};
    const add = (id, n) => { if (n) d[id] = (d[id] || 0) + n; };
    for (const [voter, i] of Object.entries(c.votes)) {
      const o = c.options[i];
      if (o.real) {
        add(voter, POINTS.truth);
        add(c.artist, POINTS.artist);
        G.stats.truth[voter] = (G.stats.truth[voter] || 0) + 1;
      } else for (const a of o.authors) {
        add(a, POINTS.fool);
        G.stats.fooled[a] = (G.stats.fooled[a] || 0) + 1;
      }
    }
    const voters = Object.keys(c.votes);
    if (voters.length > 1 && voters.every((v) => c.options[c.votes[v]].real)) d[c.artist] = POINTS.allGuessedArtist;
    for (const [id, n] of Object.entries(d)) if (G.scores[id] != null) G.scores[id] += n;
    c.deltas = d;
    G.phase = 'reveal';
    api.sfx('drum');
    api.setTimer(c.options.length * T.revealPer + T.revealTail, nextDrawing);
    api.sync();
  }

  function finish() {
    const ids = alive(G.participants);
    const scoreOf = (id) => G.scores[id] || 0;
    const top = (o) => { const e = Object.entries(o).filter(([id, v]) => v > 0 && api.getPlayer(id)).sort((a, b) => b[1] - a[1])[0]; return e ? e[0] : null; };
    api.finish({
      ranking: rankByScore(ids, scoreOf),
      scores: Object.fromEntries(ids.map((id) => [id, scoreOf(id)])),
      titles: [{ key: 'title.doodle.liar', playerId: top(G.stats.fooled) }, { key: 'title.doodle.eye', playerId: top(G.stats.truth) }]
    });
  }

  /* ------------------------------ представления ------------------------------ */

  function curView(forTv) {
    const c = G.cur;
    if (!c) return null;
    const v = { artist: c.artist, wrote: Object.keys(c.lies), voted: Object.keys(c.votes) };
    if (forTv) v.strokes = G.sheets[c.artist].strokes;
    if (G.phase === 'vote' || G.phase === 'reveal') v.options = c.options.map((o) => ({ i: o.i, text: o.text }));
    if (G.phase === 'reveal') {
      v.options = c.options.map((o) => ({ i: o.i, text: o.text, real: o.real, house: !!o.house, authors: o.authors,
        voters: Object.keys(c.votes).filter((id) => c.votes[id] === o.i) }));
      v.deltas = c.deltas;
    }
    return v;
  }

  function tvView() {
    return {
      phase: G.phase, round: G.round, rounds: G.rounds, participants: alive(G.participants), scores: G.scores,
      done: Object.keys(G.sheets).filter((id) => G.sheets[id].done),
      left: G.queue.length, cur: G.phase === 'draw' ? null : curView(true)
    };
  }

  function playerView(p) {
    if (!G.participants.includes(p.id)) return { spectator: true, phase: G.phase };
    const sh = G.sheets[p.id];
    const v = { phase: G.phase, round: G.round, rounds: G.rounds, score: G.scores[p.id] || 0, cur: G.phase === 'draw' ? null : curView(false) };
    if (G.phase === 'draw' && sh) Object.assign(v, { phrase: sh.phrase, done: sh.done, canSwap: !sh.swapped && !sh.strokes.length });
    if (G.cur && G.phase !== 'draw') {
      v.isArtist = G.cur.artist === p.id;
      v.myLie = G.cur.lies[p.id] || null;
      v.myVote = G.cur.votes[p.id] != null ? G.cur.votes[p.id] : null;
      if (v.isArtist) v.myPhrase = G.sheets[p.id].phrase;
      if (G.phase === 'vote') v.myOptions = G.cur.options.filter((o) => o.authors.includes(p.id)).map((o) => o.i);
      if (G.phase === 'reveal') v.delta = G.cur.deltas[p.id] || 0;
    }
    return v;
  }

  /* ------------------------------ боты ------------------------------ */

  function botDraw(p) {
    const sh = G.sheets[p.id];
    if (!sh || G.phase !== 'draw') return;
    let x = randInt(200, 800), y = randInt(200, 800);
    const id = 'b' + Math.random().toString(36).slice(2, 7);
    const ops = [{ o: 's', id, c: randInt(0, 5), w: randInt(0, 1), p: [x, y] }];
    for (let k = 0; k < 8; k++) { x = Math.max(20, Math.min(980, x + randInt(-90, 90))); y = Math.max(20, Math.min(980, y + randInt(-90, 90))); ops.push({ o: 'a', id, p: [x, y] }); }
    api.act(p, 'draw', { ops });
  }

  function bot(p) {
    if (!isPart(p.id)) return;
    const m = p.memo, ts = Math.max(api.timeScale, 0.05);
    const key = G.round + ':' + G.phase + ':' + (G.cur ? G.cur.artist : '') + ':' + G.queue.length;
    const once = (k, ms, fn) => { if (m[k]) return; m[k] = true; later(ms, fn); };
    if (G.phase === 'draw' && G.sheets[p.id] && !G.sheets[p.id].done) {
      for (let i = 0; i < 4; i++) once(key + ':d' + i, randInt(800, 6000) * ts * (i + 1), () => botDraw(p));
      once(key + ':done', randInt(25000, 40000) * ts, () => api.act(p, 'done'));
    }
    if (G.phase === 'lie' && G.cur.artist !== p.id) once(key, randInt(3000, 15000) * ts, () => api.act(p, 'lie', { text: pick(PHRASES[lang]) }));
    if (G.phase === 'vote' && G.cur.artist !== p.id) {
      const opts = G.cur.options.filter((o) => !o.authors.includes(p.id));
      const real = opts.find((o) => o.real);
      once(key, randInt(2000, 9000) * ts, () => api.act(p, 'vote', { i: (Math.random() < 0.35 && real ? real : pick(opts)).i }));
    }
  }

  return {
    start() { startDraw(); },
    action(player, type, data) {
      if (type === 'draw') draw(player, data.ops);
      else if (type === 'swap') swapPhrase(player);
      else if (type === 'done') doneDrawing(player);
      else if (type === 'lie') lie(player, data.text);
      else if (type === 'vote') vote(player, data.i | 0);
    },
    tvView,
    playerView,
    join(p) {
      // вернувшемуся художнику — его рисунок
      const sh = G.sheets[p.id];
      if (G.phase === 'draw' && sh) later(300, () => api.toPlayer(p.id, 'doodle:full', { strokes: sh.strokes }));
    },
    leave(id) {
      if (G.phase === 'lie' && G.cur && G.cur.artist === id) return nextDrawing();
      if (alive(G.participants).length < 2) return finish();
      if (G.phase === 'draw' && alive(G.participants).every((x) => !G.sheets[x] || G.sheets[x].done)) return startJudging();
      api.sync();
    },
    bot,
    destroy() { cancelJobs(); }
  };
}

module.exports = { create };
