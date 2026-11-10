'use strict';
/*
 * «Телепатия» (2–8, кооператив).
 * Ход: Связной видит 2 загаданных предмета сцены и 1 ловушку (похожий предмет из пары
 * к одному из загаданных) и пишет ОДНО слово. Остальные вместе выбирают 2 предмета.
 * Угадан один +1, оба +3; ловушка — ход сгорает (0). Связной меняется каждый ход.
 */
const { SCENES } = require('./alien');
const HINTS = require('../data/hints');
const { pick, shuffle, randInt, normalize, rankByScore } = require('../lib/util');

const T = { clue: 45, guess: 50, reveal: 7 };

function create(api) {
  const parts = api.players.filter((p) => p.connected).map((p) => p.id);
  const lang = api.settings.lang === 'en' ? 'en' : 'ru';
  const I18N = require('../public/js/i18n.js').I18N;
  const order = shuffle(parts);
  const laps = order.length <= 3 ? 3 : 2;
  const G = {
    phase: 'clue', turnNo: 0, turns: [], turn: null, team: 0,
    participants: parts, scores: Object.fromEntries(parts.map((id) => [id, 0])), giverPts: {}
  };
  for (let l = 0; l < laps; l++) G.turns.push(...order);
  G.total = G.turns.length;
  let jobs = [];
  const later = (ms, fn) => { const c = api.later(ms, fn); jobs.push(c); return c; };
  const alive = (ids) => ids.filter((id) => api.getPlayer(id));
  const isPart = (id) => G.participants.includes(id) && api.getPlayer(id);
  const guessers = () => alive(G.participants).filter((id) => id !== G.turn.giver);

  function nextTurn() {
    jobs.forEach((c) => c()); jobs = [];
    while (G.turns.length && !api.getPlayer(G.turns[0])) G.turns.shift();
    if (!G.turns.length || alive(G.participants).length < 2) return finish();
    const giver = G.turns.shift();
    G.turnNo++;
    const scene = pick(SCENES);
    const pair = pick(scene.pairs);
    const [t1, trap] = Math.random() < 0.5 ? pair : [pair[1], pair[0]];
    const t2 = pick(scene.items.filter((i) => !pair.includes(i.id))).id;
    G.turn = { giver, sceneId: scene.id, targets: shuffle([t1, t2]), trap, clue: null, sel: [], pts: 0, trapHit: false };
    G.phase = 'clue';
    api.setTimer(T.clue, () => startGuess(null));
    api.sync();
  }

  function nameWords(id) {
    return normalize((I18N[lang]['item.' + id] || '')).split(' ').filter((w) => w.length > 2);
  }

  function giveClue(player, word) {
    const tr = G.turn;
    if (G.phase !== 'clue' || player.id !== tr.giver) return;
    const w = String(word || '').trim();
    if (!w || /\s/.test(w) || [...w].length > 20) return api.toPlayer(player.id, 'errorMsg', { key: 'err.badWord' });
    // Нельзя подсказывать прямым названием загаданного предмета
    const n = normalize(w);
    if (tr.targets.some((id) => nameWords(id).includes(n))) return api.toPlayer(player.id, 'errorMsg', { key: 'tele.errName' });
    startGuess(w);
  }

  function startGuess(word) {
    if (G.phase !== 'clue') return;
    G.turn.clue = word || false;
    G.phase = 'guess';
    api.setTimer(T.guess, resolve);
    api.sync();
  }

  function toggle(player, itemId) {
    const tr = G.turn;
    if (G.phase !== 'guess' || !isPart(player.id) || player.id === tr.giver) return;
    const scene = SCENES.find((s) => s.id === tr.sceneId);
    if (!scene.items.some((i) => i.id === itemId)) return;
    const i = tr.sel.findIndex((s) => s.item === itemId);
    if (i >= 0) tr.sel.splice(i, 1);
    else {
      tr.sel.push({ item: itemId, by: player.id });
      if (tr.sel.length > 2) tr.sel.shift();
    }
    api.sync();
  }

  function resolve() {
    const tr = G.turn;
    if (G.phase !== 'guess') return;
    const chosen = tr.sel.map((s) => s.item);
    tr.trapHit = chosen.includes(tr.trap);
    const hits = chosen.filter((id) => tr.targets.includes(id)).length;
    tr.hits = hits;
    tr.pts = tr.trapHit ? 0 : hits === 2 ? 3 : hits;
    G.team += tr.pts;
    for (const id of alive(G.participants)) G.scores[id] += tr.pts;
    G.giverPts[tr.giver] = (G.giverPts[tr.giver] || 0) + tr.pts;
    G.phase = 'reveal';
    api.sfx(tr.trapHit ? 'err' : tr.pts ? 'win' : 'err');
    api.setTimer(T.reveal, nextTurn);
    api.sync();
  }

  function finish() {
    const ids = alive(G.participants);
    // Общий счёт одинаков, поэтому места решает вклад Связного
    const scoreOf = (id) => G.giverPts[id] || 0;
    const best = ids.slice().sort((a, b) => scoreOf(b) - scoreOf(a))[0];
    api.finish({
      ranking: rankByScore(ids, scoreOf),
      scores: Object.fromEntries(ids.map((id) => [id, scoreOf(id)])),
      titles: [best && scoreOf(best) > 0 && { key: 'title.tele.medium', playerId: best }]
    });
  }

  function publicTurn(withSecret) {
    const tr = G.turn;
    if (!tr) return null;
    const v = { giver: tr.giver, sceneId: tr.sceneId, clue: G.phase === 'clue' ? null : tr.clue, sel: tr.sel };
    if (G.phase === 'reveal' || withSecret) Object.assign(v, { targets: tr.targets, trap: tr.trap });
    if (G.phase === 'reveal') Object.assign(v, { pts: tr.pts, trapHit: tr.trapHit, hits: tr.hits });
    return v;
  }

  return {
    start() { nextTurn(); },
    action(player, type, data) {
      if (type === 'clue') giveClue(player, data.word);
      else if (type === 'pick') toggle(player, data.itemId);
      else if (type === 'done') { if (G.phase === 'guess' && player.id !== G.turn.giver && isPart(player.id)) resolve(); }
    },
    tvView() {
      return { phase: G.phase, turnNo: G.turnNo, total: G.total, team: G.team, maxTeam: G.total * 3,
        participants: alive(G.participants), scores: G.giverPts, turn: publicTurn(false) };
    },
    playerView(p) {
      if (!G.participants.includes(p.id)) return { spectator: true, phase: G.phase };
      const isGiver = G.turn && G.turn.giver === p.id;
      return { phase: G.phase, turnNo: G.turnNo, total: G.total, team: G.team, isGiver,
        turn: publicTurn(isGiver && G.phase === 'clue') };
    },
    leave(id) {
      if (G.turn && G.turn.giver === id && G.phase !== 'reveal') { G.phase = 'guess'; G.turn.sel = []; return resolve(); }
      if (alive(G.participants).length < 2) return finish();
      api.sync();
    },
    bot(p) {
      const tr = G.turn, ts = Math.max(api.timeScale, 0.1);
      if (!tr || !isPart(p.id)) return;
      const m = p.memo, key = G.turnNo + ':' + G.phase;
      const once = (k, ms, fn) => { if (m[k]) return; m[k] = true; later(ms, fn); };
      if (G.phase === 'clue' && tr.giver === p.id) {
        // Бот-связной берёт подсказку к одному из загаданных предметов
        const h = (HINTS[tr.targets[0]] || {})[lang] || ['?'];
        once(key, randInt(2000, 6000) * ts, () => api.act(p, 'clue', { word: pick(h) }));
      }
      if (G.phase === 'guess' && tr.giver !== p.id) {
        const scene = SCENES.find((s) => s.id === tr.sceneId);
        const humans = guessers().some((id) => !api.getPlayer(id).isBot);
        for (let i = 0; i < 2; i++) {
          once(key + ':p' + i, randInt(3000, 12000) * ts * (i + 1) / 1.5, () => {
            if (G.phase !== 'guess' || tr.sel.length >= 2) return;
            const r = Math.random();
            const free = scene.items.map((x) => x.id).filter((id) => !tr.sel.some((s) => s.item === id));
            const target = tr.targets.find((id) => free.includes(id));
            const choice = r < 0.5 && target ? target : r < 0.6 ? tr.trap : pick(free.filter((id) => id !== tr.trap));
            api.act(p, 'pick', { itemId: choice });
          });
        }
        // Если угадывают одни боты — сами жмут «Готово»
        if (!humans) once(key + ':done', 17000 * ts, () => { if (tr.sel.length >= 2) api.act(p, 'done'); });
      }
    },
    destroy() { jobs.forEach((c) => c()); jobs = []; }
  };
}

module.exports = { create };
