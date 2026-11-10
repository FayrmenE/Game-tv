'use strict';
/*
 * «Чужой» — модуль игры для платформы.
 * Правила и логика раунда перенесены из исходного server.js без изменений:
 * функции ниже (startRound … playerView) — тот же код, работающий с объектом
 * `room`, который здесь — адаптер к API платформы.
 */
const path = require('path');
const fs = require('fs');
const { pick, shuffle, rankByScore, randInt } = require('../lib/util');

const HINTS = require('../data/hints');
const SCENES = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'scenes.json'), 'utf8')).scenes;
const MIN_PLAYERS = Number(process.env.MIN_PLAYERS) || 3;
const MAX_PLAYERS = 10;

// Длительности (секунды)
const T = {
  look: 10,
  word: 20,
  discussBase: 30,
  discussPerPlayer: 10,
  freezeBefore: 15,   // за сколько до конца обсуждения замораживаются голоса
  lastwordSolo: 15,
  lastwordTie: 10,
  revote: 5,
  runoff: 15,
  lastchance: 30,
  quietAccel: 10,     // все проголосовали и 10 сек без изменений → ускорение
  accelSpeed: 3,
  revealPerVote: 1.2,
  revealTail: 6
};
const PACE = { fast: 0.7, normal: 1, long: 1.5 };
const VOTING_PHASES = ['discuss', 'revote', 'runoff'];

function validWord(w) {
  if (typeof w !== 'string') return null;
  w = w.trim();
  if (!w || /\s/.test(w) || [...w].length > 20) return null;
  return w;
}

function create(api) {
  /* ---------- адаптер: «комната» Чужого поверх платформы ---------- */
  const room = {
    get code() { return api.code; },
    get players() { return api.players; },
    get settings() { return api.settings; },
    get paused() { return api.paused; },
    get hostId() { return api.hostId; },
    get timer() { return api.timer; },
    phase: 'lobby', round: null, roundNo: 0,
    lastAlienId: null, lastFirstId: null, notice: null,
    scores: {},
    stats: {
      alienPts: {}, detective: {},
      bump(id, r, n) {
        if (id === r.alienId) this.alienPts[id] = (this.alienPts[id] || 0) + n;
        else if (r.revealVotes.some((v) => v.voter === id && v.target === r.alienId)) this.detective[id] = (this.detective[id] || 0) + 1;
      }
    }
  };
  const getPlayer = (rm, id) => api.getPlayer(id);
  const inRound = (rm, id) => !!(rm.round && rm.round.participants.includes(id) && getPlayer(rm, id));
  function activeIds(rm) { return rm.round ? rm.round.participants.filter((id) => getPlayer(rm, id)) : []; }
  const setTimer = (rm, sec, fn) => api.setTimer(sec, fn);
  const clearTimer = () => api.clearTimer();
  const sync = () => api.sync();

  /* ================= исходная логика раунда (без изменений) ================= */
  function startRound(room) {
    const parts = room.players.filter((p) => p.connected).map((p) => p.id);
    if (parts.length < MIN_PLAYERS) return false;
    const scene = pick(SCENES);
    const pair = pick(scene.pairs);
    const [itemA, itemB] = Math.random() < 0.5 ? pair : [pair[1], pair[0]];
    const cands = parts.filter((id) => id !== room.lastAlienId);
    const alienId = pick(cands.length ? cands : parts);
    const order = shuffle(parts);
    if (order.length > 1 && order[0] === room.lastFirstId) order.push(order.shift());
    room.lastAlienId = alienId;
    room.lastFirstId = order[0];
    room.roundNo++;
    room.notice = null;
    room.round = {
      sceneId: scene.id, itemA, itemB, alienId, participants: parts,
      looked: [],
      turns: [...order.map((id) => ({ id, c: 0 })), ...order.map((id) => ({ id, c: 1 }))],
      turnIdx: 0,
      words: Object.fromEntries(parts.map((id) => [id, [null, null]])),
      votes: {}, frozen: false, lastVoteChange: Date.now(), plus30Used: false,
      leaders: [], speakerIdx: 0, runoff: false, candidates: null,
      accused: null, revealVotes: [], guess: null, outcome: null, deltas: {}
    };
    room.phase = 'look';
    setTimer(room, T.look, () => startWords(room));
    sync(room);
    return true;
  }

  function startWords(room) {
    room.phase = 'words';
    room.round.turnIdx = 0;
    beginTurn(room);
  }

  function beginTurn(room) {
    const r = room.round;
    // Пропускаем ходы игроков, которых уже нет в комнате
    while (r.turnIdx < r.turns.length && !getPlayer(room, r.turns[r.turnIdx].id)) r.turnIdx++;
    if (r.turnIdx >= r.turns.length) return startDiscuss(room);
    setTimer(room, T.word, () => recordWord(room, false));
    sync(room);
  }

  function recordWord(room, word) {
    const r = room.round;
    const turn = r.turns[r.turnIdx];
    if (!turn) return;
    if (r.words[turn.id]) r.words[turn.id][turn.c] = word; // false = не успел («—»)
    r.turnIdx++;
    beginTurn(room);
  }

  function startDiscuss(room) {
    const r = room.round;
    room.phase = 'discuss';
    r.votes = {};
    r.frozen = false;
    r.candidates = null;
    r.lastVoteChange = Date.now();
    const n = activeIds(room).length;
    const total = Math.round((T.discussBase + T.discussPerPlayer * n) * (PACE[room.settings.pace] || 1));
    setTimer(room, Math.max(5, total - T.freezeBefore), () => endDiscuss(room));
    sync(room);
  }

  function computeLeaders(room) {
    const r = room.round;
    const counts = {};
    for (const [voter, target] of Object.entries(r.votes)) {
      if (!inRound(room, voter) || !inRound(room, target)) continue;
      if (r.candidates && !r.candidates.includes(target)) continue;
      counts[target] = (counts[target] || 0) + 1;
    }
    const max = Math.max(0, ...Object.values(counts));
    return max > 0 ? Object.keys(counts).filter((id) => counts[id] === max) : [];
  }

  function voteCounts(room) {
    const r = room.round;
    const counts = {};
    for (const [voter, target] of Object.entries(r.votes)) {
      if (inRound(room, voter) && inRound(room, target)) counts[target] = (counts[target] || 0) + 1;
    }
    return counts;
  }

  function endDiscuss(room) {
    const r = room.round;
    r.leaders = computeLeaders(room);
    if (!r.leaders.length) return startRevote(room);
    room.phase = 'lastword';
    r.frozen = true;
    r.speakerIdx = 0;
    setTimer(room, r.leaders.length === 1 ? T.lastwordSolo : T.lastwordTie, () => nextSpeaker(room));
    sync(room);
  }

  function nextSpeaker(room) {
    const r = room.round;
    r.speakerIdx++;
    while (r.speakerIdx < r.leaders.length && !getPlayer(room, r.leaders[r.speakerIdx])) r.speakerIdx++;
    if (r.speakerIdx < r.leaders.length) {
      setTimer(room, T.lastwordTie, () => nextSpeaker(room));
      sync(room);
    } else startRevote(room);
  }

  function startRevote(room) {
    room.phase = 'revote';
    room.round.frozen = false;
    setTimer(room, T.revote, () => finalizeVote(room));
    sync(room);
  }

  function finalizeVote(room) {
    const r = room.round;
    r.frozen = true;
    const leaders = computeLeaders(room);
    r.leaders = leaders;
    if (leaders.length === 1) { r.accused = leaders[0]; return startReveal(room); }
    if (leaders.length > 1 && !r.runoff) {
      r.runoff = true;
      r.candidates = leaders;
      r.votes = {};
      r.frozen = false;
      room.phase = 'runoff';
      setTimer(room, T.runoff, () => finalizeVote(room));
      return sync(room);
    }
    r.accused = null; // никого не выбрали или снова ничья — Чужой не пойман
    startReveal(room);
  }

  function startReveal(room) {
    const r = room.round;
    room.phase = 'reveal';
    r.revealVotes = shuffle(Object.entries(r.votes)
      .filter(([v, t]) => inRound(room, v) && inRound(room, t))
      .map(([voter, target]) => ({ voter, target })));
    setTimer(room, r.revealVotes.length * T.revealPerVote + T.revealTail, () => afterReveal(room));
    sync(room);
  }

  function afterReveal(room) {
    const r = room.round;
    if (r.accused && r.accused === r.alienId) {
      room.phase = 'lastchance';
      setTimer(room, T.lastchance, () => finishRound(room));
      sync(room);
    } else finishRound(room);
  }

  function finishRound(room) {
    const r = room.round;
    const caught = r.accused && r.accused === r.alienId;
    const deltas = {};
    const add = (id, n) => { deltas[id] = (deltas[id] || 0) + n; };
    if (!caught) { r.outcome = 'alien_escaped'; add(r.alienId, 3); }
    else if (r.guess === r.itemA) { r.outcome = 'alien_guessed'; add(r.alienId, 2); }
    else {
      r.outcome = 'civilians_win';
      for (const id of activeIds(room)) if (id !== r.alienId) add(id, 1);
    }
    // Бонус каждому мирному, кто в финальном голосовании указал на Чужого
    for (const { voter, target } of r.revealVotes) if (target === r.alienId && voter !== r.alienId) add(voter, 1);
    for (const [id, n] of Object.entries(deltas)) { if (getPlayer(room, id)) { room.scores[id] = (room.scores[id] || 0) + n; room.stats.bump(id, r, n); } }
    r.deltas = deltas;
    room.phase = 'roundEnd';
    clearTimer(room);
    sync(room);
  }

  function abortRound(room, reasonKey) {
    room.round = null;
    room.phase = 'lobby';
    room.notice = { key: 'roundAborted', reasonKey };
    clearTimer(room);
    sync(room);
  }

  function removePlayer(room, id) {
    const r = room.round;
    if (!r || !r.participants.includes(id) || room.phase === 'roundEnd') {
      if (r && room.phase === 'roundEnd') r.participants = r.participants.filter((x) => x !== id);
      return sync(room);
    }
    if (id === r.alienId && room.phase !== 'lastchance') return abortRound(room, 'abort.alienLeft');
    if (activeIds(room).length < 3) return abortRound(room, 'abort.tooFew');
    // Чистим голоса за и от игрока
    for (const [v, t] of Object.entries(r.votes)) if (v === id || t === id) delete r.votes[v];
    if (room.phase === 'words' && r.turns[r.turnIdx] && r.turns[r.turnIdx].id === id) {
      r.turnIdx++;
      return beginTurn(room);
    }
    if (room.phase === 'lastword' && r.leaders[r.speakerIdx] === id) return nextSpeaker(room);
    sync(room);
  }

  /* ------------------------------ представления ------------------------------ */

  function publicView(room) {
    const r = room.round;
    const ph = room.phase;
    const after = ['reveal', 'lastchance', 'roundEnd'].includes(ph);
    const view = {
      code: room.code, phase: ph, paused: room.paused, settings: room.settings,
      roundNo: room.roundNo, minPlayers: MIN_PLAYERS, maxPlayers: MAX_PLAYERS,
      hostId: room.hostId, notice: room.notice,
      players: room.players.map((p) => ({
        id: p.id, name: p.name, color: p.color, connected: p.connected, score: room.scores[p.id] || 0,
        inRound: !!(r && r.participants.includes(p.id)),
        looked: !!(r && r.looked.includes(p.id))
      })),
      round: null
    };
    if (r) {
      const turn = ph === 'words' ? r.turns[r.turnIdx] : null;
      view.round = {
        sceneId: r.sceneId,
        participants: r.participants.filter((id) => getPlayer(room, id)),
        order: r.turns.slice(0, r.turns.length / 2).map((t) => t.id),
        turn: turn ? { id: turn.id, c: turn.c } : null,
        words: r.words,
        voteCounts: (VOTING_PHASES.includes(ph) || ph === 'lastword') ? voteCounts(room) : {},
        votedCount: Object.keys(r.votes).filter((v) => inRound(room, v)).length,
        frozen: r.frozen,
        accelerated: !!(room.timer && room.timer.speed > 1),
        leaders: ['lastword', 'runoff'].includes(ph) ? r.leaders : [],
        speakerId: ph === 'lastword' ? r.leaders[r.speakerIdx] : null,
        candidates: r.candidates,
        plus30Used: r.plus30Used
      };
      if (after) {
        const caught = !!r.accused && r.accused === r.alienId;
        Object.assign(view.round, { accused: r.accused, caught, revealVotes: r.revealVotes, alienId: r.alienId });
        // Если Чужого поймали, предметы не показываем до конца его последнего шанса —
        // иначе он просто подсмотрит ответ на ТВ.
        if (ph === 'roundEnd' || !caught) Object.assign(view.round, { itemA: r.itemA, itemB: r.itemB });
      }
      if (ph === 'roundEnd') Object.assign(view.round, { guess: r.guess, outcome: r.outcome, deltas: r.deltas });
    }
    return view;
  }

  function playerView(room, p, pub) {
    const r = room.round;
    const me = { id: p.id, name: p.name, color: p.color, isHost: room.hostId === p.id, inRound: inRound(room, p.id) };
    const priv = {};
    if (r && me.inRound) {
      if (room.phase === 'look') {
        const itemId = p.id === r.alienId ? r.itemB : r.itemA;
        const scene = SCENES.find((s) => s.id === r.sceneId);
        const it = scene.items.find((i) => i.id === itemId);
        priv.item = { id: itemId, num: it.num };
      }
      priv.myVote = r.votes[p.id] || null;
      if (room.phase === 'lastchance' && p.id === r.alienId) priv.guessing = true;
    }
    return Object.assign({}, pub, { me, priv });
  }

  /* ================= конец исходной логики ================= */

  function finishMatch() {
    const ids = api.players.map((p) => p.id);
    const scoreOf = (id) => room.scores[id] || 0;
    const best = (obj) => {
      const e = Object.entries(obj).filter(([id, v]) => v > 0 && getPlayer(room, id)).sort((a, b) => b[1] - a[1])[0];
      return e ? e[0] : null;
    };
    api.finish({
      ranking: rankByScore(ids, scoreOf),
      scores: Object.fromEntries(ids.map((id) => [id, scoreOf(id)])),
      titles: [
        { key: 'title.alien.disguise', playerId: best(room.stats.alienPts) },
        { key: 'title.alien.detective', playerId: best(room.stats.detective) }
      ]
    });
  }

  const BOT_WORDS = { ru: ['круглый', 'большой', 'яркий', 'полезный'], en: ['round', 'big', 'bright', 'useful'] };
  // Бот играет честно: знает только свой предмет (Чужой-бот — свой «чужой»)
  const botItem = (p, r) => (p.id === r.alienId ? r.itemB : r.itemA);
  function botWord(p, r, c) {
    const lang = api.settings.lang === 'en' ? 'en' : 'ru';
    const list = (HINTS[botItem(p, r)] || {})[lang] || BOT_WORDS[lang];
    return list[(c + (p.id.charCodeAt(1) || 0)) % list.length];
  }
  // Голосует за того, чьи слова хуже всего подходят к его предмету
  function botSuspect(p, r, cands) {
    const lang = api.settings.lang === 'en' ? 'en' : 'ru';
    const mine = ((HINTS[botItem(p, r)] || {})[lang] || []).map((w) => w.toLowerCase());
    const scored = cands.map((id) => {
      const ws = (r.words[id] || []).filter((w) => typeof w === 'string').map((w) => w.toLowerCase());
      return { id, s: ws.filter((w) => mine.includes(w)).length - (r.words[id] || []).filter((w) => w === false).length * 0.5 + Math.random() * 0.4 };
    }).sort((a, b) => a.s - b.s);
    return scored[0].id;
  }

  const game = {
    start() { if (!startRound(room)) sync(); },

    action(player, type, data) {
      const r = room.round;
      if (type === 'looked') {
        if (room.phase !== 'look' || !inRound(room, player.id)) return;
        if (!r.looked.includes(player.id)) { r.looked.push(player.id); sync(); }
      } else if (type === 'word') {
        if (room.phase !== 'words') return;
        const turn = r.turns[r.turnIdx];
        if (!turn || turn.id !== player.id) return;
        const w = validWord(data.word);
        if (!w) return api.toPlayer(player.id, 'errorMsg', { key: 'err.badWord' });
        recordWord(room, w);
      } else if (type === 'vote') {
        if (!VOTING_PHASES.includes(room.phase)) return;
        if (r.frozen || !inRound(room, player.id)) return;
        const target = data.targetId;
        if (target === player.id || !inRound(room, target)) return;
        if (r.candidates && !r.candidates.includes(target)) return;
        if (r.votes[player.id] === target) return;
        r.votes[player.id] = target;
        r.lastVoteChange = Date.now();
        if (room.timer && room.timer.speed > 1) room.timer.speed = 1;
        sync();
      } else if (type === 'guess') {
        if (room.phase !== 'lastchance' || player.id !== r.alienId) return;
        const scene = SCENES.find((s) => s.id === r.sceneId);
        if (!scene.items.some((i) => i.id === data.itemId)) return;
        r.guess = data.itemId;
        finishRound(room);
      }
    },

    host(type) {
      if (type === 'alien:next') {
        if (room.phase !== 'roundEnd' && room.phase !== 'lobby') return null;
        if (!startRound(room)) return { key: 'err.notEnough', vars: { min: MIN_PLAYERS } };
      } else if (type === 'alien:plus30') {
        const r = room.round;
        if (!r || r.plus30Used || !room.timer || room.phase === 'roundEnd') return null;
        r.plus30Used = true;
        room.timer.remaining += 30000 * api.timeScale;
        room.timer.total += 30000 * api.timeScale;
        api.emitTimer();
        sync();
      } else if (type === 'alien:finish') {
        if (room.phase === 'roundEnd' || room.phase === 'lobby') finishMatch();
      }
      return null;
    },

    // Ускорение таймера обсуждения (было в общем тике сервера)
    tick(now) {
      const tm = room.timer;
      if (room.phase !== 'discuss' || !tm) return;
      const r = room.round;
      const ids = activeIds(room).filter((id) => getPlayer(room, id).connected);
      const allVoted = ids.length > 0 && ids.every((id) => r.votes[id]);
      const speed = allVoted && now - r.lastVoteChange >= T.quietAccel * 1000 * api.timeScale ? T.accelSpeed : 1;
      if (speed !== tm.speed) { tm.speed = speed; sync(); }
    },

    leave(id) { removePlayer(room, id); },
    tvView() { return publicView(room); },
    playerView(p) {
      const pub = publicView(room);
      const v = playerView(room, p, pub);
      v.me.isHost = api.hostId === p.id;
      return v;
    },

    /* ---------- боты ---------- */
    bot(p, v) {
      const m = p.memo, r = room.round;
      if (!r || !inRound(room, p.id)) return;
      const key = room.roundNo + ':' + room.phase;
      const once = (k, ms, fn) => { if (m[k]) return; m[k] = true; api.later(ms, fn); };
      if (room.phase === 'look') once(key + ':look', randInt(500, 4000), () => api.act(p, 'looked'));
      if (room.phase === 'words' && r.turns[r.turnIdx] && r.turns[r.turnIdx].id === p.id) {
        const t = r.turns[r.turnIdx];
        once(key + ':w' + t.c, randInt(1500, 6000), () => api.act(p, 'word', { word: botWord(p, r, t.c) }));
      }
      if (VOTING_PHASES.includes(room.phase) && !r.frozen) {
        const cands = (r.candidates || r.participants).filter((id) => id !== p.id && getPlayer(room, id));
        if (cands.length) {
          once(key + ':v', randInt(2000, 9000), () => api.act(p, 'vote', { targetId: botSuspect(p, r, cands) }));
        }
      }
      if (room.phase === 'lastchance' && p.id === r.alienId) {
        const scene = SCENES.find((s) => s.id === r.sceneId);
        // Пойманный бот знает лишь свой предмет: ищет похожий (пару) или ошибается
        const pair = scene.pairs.find((pr) => pr.includes(r.itemB));
        const guess = pair && Math.random() < 0.5 ? pair.find((x) => x !== r.itemB) : pick(scene.items).id;
        once(key + ':g', randInt(3000, 8000), () => api.act(p, 'guess', { itemId: guess }));
      }
    }
  };
  return game;
}

module.exports = { create, SCENES };
