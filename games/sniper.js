'use strict';
/*
 * «Снайпер» (2–10 игроков).
 * 10 целей. Перед каждой ТВ 3 сек показывает «Ловим: …», затем картинки по одной.
 * Цель появляется один раз (позиция 5…15), около трети остальных — похожая приманка
 * (второй предмет из пары), остальное — случайные предметы.
 * Время реакции считает сервер: момент нажатия (приход − ½ RTT телефона)
 * минус момент показа цели (отправка на ТВ + ½ RTT ТВ).
 */
const { SCENES } = require('./alien');
const { pick, shuffle, randInt, rankByScore } = require('../lib/util');

const TARGETS = 10;
const INTRO_SEC = 3;
const RESULTS_SEC = 5;
const GRACE_MS = 350;           // сколько после смены картинки ещё засчитываем попадание в цель
const LOCK_MS = 1000;
const AFTER_TARGET = 3;         // картинок после цели
const POINTS = [3, 2, 1];
const WRONG = -2;

const ALL_ITEMS = SCENES.flatMap((s) => s.items.map((i) => i.id));
const PAIRS = SCENES.flatMap((s) => s.pairs);

const speedFor = (i) => Math.round(900 - i * (500 / (TARGETS - 1)));

function buildTarget(i, used) {
  let pair;
  do { pair = pick(PAIRS); } while (used.has(pair[0]) && used.size < PAIRS.length);
  used.add(pair[0]);
  const [target, decoy] = Math.random() < 0.5 ? pair : [pair[1], pair[0]];
  const pos = randInt(5, 15) - 1;
  const total = pos + 1 + AFTER_TARGET;
  const others = ALL_ITEMS.filter((id) => id !== target && id !== decoy);
  const seq = [];
  for (let k = 0; k < total; k++) {
    if (k === pos) { seq.push(target); continue; }
    let id;
    do { id = Math.random() < 1 / 3 ? decoy : pick(others); } while (seq[k - 1] === id);
    seq.push(id);
  }
  return { target, decoy, pos, seq, ms: speedFor(i) };
}

function create(api) {
  const used = new Set();
  const G = {
    phase: 'calibrate', idx: -1, cur: null, round: null,
    participants: api.players.filter((p) => p.connected).map((p) => p.id),
    scores: {}, best: {}, hitsTotal: {},
    hits: [], wrongs: {}, locks: {}, shownAt: [], results: null
  };
  G.participants.forEach((id) => { G.scores[id] = 0; });
  let cancelStream = [];

  const isPart = (id) => G.participants.includes(id) && api.getPlayer(id);

  function nextTarget() {
    G.idx++;
    if (G.idx >= TARGETS) return finish();
    G.round = buildTarget(G.idx, used);
    G.hits = []; G.wrongs = {}; G.shownAt = []; G.cur = null; G.results = null; G.locks = {};
    G.phase = 'intro';
    api.setTimer(INTRO_SEC, startStream);
    api.sync();
  }

  function startStream() {
    G.phase = 'stream';
    api.clearTimer();
    api.sync();
    showImage(0);
  }

  function showImage(k) {
    const R = G.round;
    if (k >= R.seq.length) {
      G.cur = null;
      api.toTv('sniper:img', { k: -1 });
      cancelStream.push(api.later(GRACE_MS + 150, resolveTarget));
      return;
    }
    G.cur = k;
    G.shownAt[k] = Date.now();
    api.toTv('sniper:img', { k, id: R.seq[k], ms: R.ms });
    // Боты: жмут на цель с реакцией 250–600 мс, иногда ошибаются на приманке
    for (const p of api.players) {
      if (!p.isBot || !isPart(p.id)) continue;
      const id = R.seq[k];
      if (id === R.target && Math.random() < 0.92) cancelStream.push(api.later(randInt(250, 600), () => api.act(p, 'shoot')));
      else if (id === R.decoy && Math.random() < 0.07) cancelStream.push(api.later(randInt(280, 500), () => api.act(p, 'shoot')));
    }
    cancelStream.push(api.later(R.ms, () => showImage(k + 1)));
  }

  function resolveTarget() {
    const hits = G.hits.slice().sort((a, b) => a.ms - b.ms);
    hits.forEach((h, i) => {
      h.pts = POINTS[i] || 0;
      G.scores[h.id] += h.pts;
      G.hitsTotal[h.id] = (G.hitsTotal[h.id] || 0) + 1;
      if (G.best[h.id] == null || h.ms < G.best[h.id]) G.best[h.id] = h.ms;
    });
    G.results = { hits, wrongs: Object.entries(G.wrongs).map(([id, n]) => ({ id, n, pts: n * WRONG })) };
    G.phase = 'results';
    api.sfx(hits.length ? 'ok' : 'lose');
    api.setTimer(RESULTS_SEC, nextTarget);
    api.sync();
  }

  function finish() {
    const ids = G.participants.filter((id) => api.getPlayer(id));
    const scoreOf = (id) => G.scores[id] || 0;
    const ranking = rankByScore(ids, scoreOf);
    // «Самый быстрый палец» — лидер по очкам (при равенстве — с лучшей реакцией)
    const top = (ranking[0] || []).slice().sort((a, b) => (G.best[a] ?? 1e9) - (G.best[b] ?? 1e9))[0];
    const fastest = Object.entries(G.best).filter(([id]) => api.getPlayer(id)).sort((a, b) => a[1] - b[1])[0];
    api.finish({
      ranking,
      scores: Object.fromEntries(ids.map((id) => [id, scoreOf(id)])),
      titles: [
        { key: 'title.sniper.fast', playerId: top },
        fastest && { key: 'title.sniper.reaction', playerId: fastest[0], vars: { ms: fastest[1] } }
      ]
    });
  }

  function shoot(player, now) {
    if (!isPart(player.id) || G.phase !== 'stream') return;
    const R = G.round;
    if (G.locks[player.id] && now < G.locks[player.id]) return api.toPlayer(player.id, 'sniper:you', { kind: 'locked', left: G.locks[player.id] - now });
    if (G.hits.some((h) => h.id === player.id)) return;
    const pressT = now - (player.rtt || 0) / 2;
    const tvHalf = (api.tvRtt || 0) / 2;
    const tShown = G.shownAt[R.pos] != null ? G.shownAt[R.pos] + tvHalf : null;
    if (tShown != null && pressT >= tShown && pressT - tShown <= R.ms + GRACE_MS) {
      const ms = Math.max(0, Math.round(pressT - tShown));
      G.hits.push({ id: player.id, ms });
      api.toPlayer(player.id, 'sniper:you', { kind: 'hit', ms });
      api.sfx('shot');
      api.sync();
    } else {
      G.scores[player.id] += WRONG;
      G.wrongs[player.id] = (G.wrongs[player.id] || 0) + 1;
      G.locks[player.id] = now + LOCK_MS;
      api.toPlayer(player.id, 'sniper:you', { kind: 'wrong', left: LOCK_MS });
      api.sfx('err');
      api.sync();
    }
  }

  function scoreRows() {
    return G.participants.filter((id) => api.getPlayer(id)).map((id) => ({
      id, score: G.scores[id] || 0, hit: G.hits.some((h) => h.id === id), wrong: G.wrongs[id] || 0
    }));
  }

  const R = () => G.round;
  return {
    start() {
      api.sync();
      api.measurePing(7).then(() => { if (G.phase === 'calibrate') nextTarget(); });
    },
    action(player, type, data, now) { if (type === 'shoot') shoot(player, now); },
    tvView() {
      return {
        phase: G.phase, n: G.idx + 1, total: TARGETS,
        target: R() && G.phase !== 'calibrate' ? R().target : null,
        ms: R() ? R().ms : speedFor(0),
        cur: G.phase === 'stream' && G.cur != null ? { k: G.cur, id: R().seq[G.cur] } : null,
        rows: scoreRows(), results: G.results,
        rtt: Object.fromEntries(G.participants.map((id) => [id, Math.round((api.getPlayer(id) || {}).rtt || 0)]))
      };
    },
    playerView(p) {
      if (!G.participants.includes(p.id)) return { spectator: true, phase: G.phase };
      const hit = G.hits.find((h) => h.id === p.id);
      return {
        phase: G.phase, n: G.idx + 1, total: TARGETS, target: R() && G.phase !== 'calibrate' ? R().target : null,
        score: G.scores[p.id] || 0, hit: hit ? hit.ms : null,
        myResult: G.results ? (G.results.hits.find((h) => h.id === p.id) || null) : null,
        myWrongs: G.wrongs[p.id] || 0
      };
    },
    tvJoin(socket) {
      if (G.phase === 'stream' && G.cur != null) socket.emit('sniper:img', { k: G.cur, id: R().seq[G.cur], ms: R().ms });
    },
    leave() { api.sync(); },
    destroy() { cancelStream.forEach((c) => c()); cancelStream = []; },
    bot() { /* боты «Снайпера» управляются прямо из showImage() */ }
  };
}

module.exports = { create, buildTarget, speedFor };
