'use strict';
/*
 * «Чужой» — сервер локальной party-игры.
 * Express раздаёт статику, socket.io ведёт игровое состояние.
 * Вся логика раунда живёт здесь; клиенты лишь показывают «вид» состояния.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const QRCode = require('qrcode');

const PORT = Number(process.env.PORT) || 3000;
const MIN_PLAYERS = Number(process.env.MIN_PLAYERS) || 4;
const MAX_PLAYERS = 10;
// Для отладки: TIME_SCALE=0.2 ускорит все таймеры в 5 раз
const TIME_SCALE = Number(process.env.TIME_SCALE) || 1;
const SCENES = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'scenes.json'), 'utf8')).scenes;

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
const COLORS = ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93', '#ff924c', '#2ec4b6', '#f15bb5', '#9b5de5', '#00bbf9'];
const VOTING_PHASES = ['discuss', 'revote', 'runoff'];

/* ------------------------------ утилиты ------------------------------ */

function lanIP() {
  if (process.env.PUBLIC_HOST) return process.env.PUBLIC_HOST;
  const nets = os.networkInterfaces();
  const cands = [];
  for (const [name, list] of Object.entries(nets)) {
    for (const n of list || []) {
      if (n.family !== 'IPv4' && n.family !== 4) continue;
      if (n.internal) continue;
      let score = 0;
      if (/^192\.168\./.test(n.address)) score += 3;
      else if (/^10\./.test(n.address)) score += 2;
      else if (/^172\.(1[6-9]|2\d|3[01])\./.test(n.address)) score += 1;
      if (/^(wl|wlan|wi-?fi|en0|wlp)/i.test(name)) score += 2;
      if (/(docker|veth|br-|vmnet|vbox|virtual|utun|tailscale|zt)/i.test(name)) score -= 5;
      cands.push({ address: n.address, score });
    }
  }
  cands.sort((a, b) => b.score - a.score);
  return cands.length ? cands[0].address : 'localhost';
}
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function makeCode() {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let c;
  do { c = Array.from({ length: 4 }, () => A[Math.floor(Math.random() * 26)]).join(''); } while (rooms.has(c));
  return c;
}
function validWord(w) {
  if (typeof w !== 'string') return null;
  w = w.trim();
  if (!w || /\s/.test(w) || [...w].length > 20) return null;
  return w;
}

/* ------------------------------ HTTP ------------------------------ */

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.redirect('/tv'));
app.get('/tv', (req, res) => res.sendFile(path.join(__dirname, 'public', 'tv.html')));
app.get('/play', (req, res) => res.sendFile(path.join(__dirname, 'public', 'play.html')));
app.get('/scenes.json', (req, res) => res.sendFile(path.join(__dirname, 'data', 'scenes.json')));

/* ------------------------------ комнаты ------------------------------ */

const rooms = new Map();

function createRoom() {
  const code = makeCode();
  const joinUrl = `http://${lanIP()}:${PORT}/play?room=${code}`;
  const room = {
    code, joinUrl, qr: null,
    players: [], hostId: null,
    settings: { lang: 'ru', pace: 'normal' },
    phase: 'lobby', round: null, roundNo: 0,
    lastAlienId: null, lastFirstId: null,
    paused: false, timer: null, lastTick: Date.now(), lastTimerEmit: 0,
    notice: null, emptySince: null
  };
  rooms.set(code, room);
  QRCode.toDataURL(joinUrl, { margin: 1, width: 512, errorCorrectionLevel: 'M' })
    .then((url) => { room.qr = url; sync(room); })
    .catch((e) => console.error('QR error', e));
  return room;
}

const getPlayer = (room, id) => room.players.find((p) => p.id === id);
const inRound = (room, id) => !!(room.round && room.round.participants.includes(id) && getPlayer(room, id));
function activeIds(room) { return room.round ? room.round.participants.filter((id) => getPlayer(room, id)) : []; }

function ensureHost(room) {
  const h = getPlayer(room, room.hostId);
  if (h && h.connected) return;
  const next = room.players.find((p) => p.connected);
  if (next) room.hostId = next.id;
  else if (!h) room.hostId = room.players[0] ? room.players[0].id : null;
}

/* ------------------------------ таймер ------------------------------ */

function setTimer(room, seconds, onEnd) {
  const ms = seconds * 1000 * TIME_SCALE;
  room.timer = { total: ms, remaining: ms, speed: 1, onEnd };
  emitTimer(room);
}
function clearTimer(room) { room.timer = null; emitTimer(room); }
function emitTimer(room) {
  room.lastTimerEmit = Date.now();
  const tm = room.timer;
  io.to(room.code).emit('timer', tm
    ? { remaining: Math.max(0, tm.remaining), total: tm.total, speed: tm.speed, paused: room.paused }
    : { remaining: 0, total: 0, speed: 1, paused: room.paused });
}

setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    const dt = now - room.lastTick;
    room.lastTick = now;
    const tm = room.timer;
    if (!tm || room.paused) continue;
    if (room.phase === 'discuss') {
      const r = room.round;
      const ids = activeIds(room).filter((id) => getPlayer(room, id).connected);
      const allVoted = ids.length > 0 && ids.every((id) => r.votes[id]);
      const speed = allVoted && now - r.lastVoteChange >= T.quietAccel * 1000 * TIME_SCALE ? T.accelSpeed : 1;
      if (speed !== tm.speed) { tm.speed = speed; sync(room); }
    }
    tm.remaining -= dt * tm.speed;
    if (tm.remaining <= 0) {
      room.timer = null;
      try { tm.onEnd(); } catch (e) { console.error(e); }
    } else if (now - room.lastTimerEmit > 250) emitTimer(room);
  }
}, 100);

// Уборка: комнаты без ТВ и без игроков дольше 30 минут
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const tvs = io.sockets.adapter.rooms.get('tv:' + code);
    const anyone = (tvs && tvs.size) || room.players.some((p) => p.connected);
    if (anyone) room.emptySince = null;
    else if (!room.emptySince) room.emptySince = now;
    else if (now - room.emptySince > 30 * 60 * 1000) { clearTimer(room); rooms.delete(code); }
  }
}, 60 * 1000);

/* ------------------------------ раунд ------------------------------ */

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
  for (const [id, n] of Object.entries(deltas)) { const p = getPlayer(room, id); if (p) p.score += n; }
  r.deltas = deltas;
  room.phase = 'roundEnd';
  clearTimer(room);
  sync(room);
}

function abortRound(room, reasonKey) {
  room.round = null;
  room.phase = 'lobby';
  room.paused = false;
  room.notice = { key: 'roundAborted', reasonKey };
  clearTimer(room);
  sync(room);
}

function removePlayer(room, id) {
  const p = getPlayer(room, id);
  if (!p) return;
  room.players = room.players.filter((x) => x.id !== id);
  if (room.hostId === id) { room.hostId = null; ensureHost(room); }
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
      id: p.id, name: p.name, color: p.color, connected: p.connected, score: p.score,
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

function sync(room) {
  const pub = publicView(room);
  io.to('tv:' + room.code).emit('state', Object.assign({}, pub, { joinUrl: room.joinUrl, qr: room.qr }));
  for (const p of room.players) if (p.socketId) io.to(p.socketId).emit('state', playerView(room, p, pub));
}

/* ------------------------------ сокеты ------------------------------ */

io.on('connection', (socket) => {
  const ctx = () => {
    const room = rooms.get(socket.data.code);
    if (!room) return {};
    return { room, player: getPlayer(room, socket.data.playerId) };
  };
  const err = (key, vars) => socket.emit('errorMsg', { key, vars });
  const asHost = (fn) => (data) => {
    const { room, player } = ctx();
    if (!room || !player) return;
    if (room.hostId !== player.id) return err('err.notHost');
    fn(room, player, data || {});
  };

  socket.on('tv:hello', (data) => {
    let room = data && data.code && rooms.get(String(data.code).toUpperCase());
    if (!room) room = createRoom();
    socket.data.code = room.code;
    socket.data.role = 'tv';
    socket.join(room.code);
    socket.join('tv:' + room.code);
    sync(room);
    emitTimer(room);
  });

  socket.on('player:join', (data) => {
    data = data || {};
    const code = String(data.room || '').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) return err('err.noRoom');
    const clientId = String(data.clientId || '').slice(0, 64);
    let p = clientId && room.players.find((x) => x.clientId === clientId);
    if (!p) {
      let name = String(data.name || '').trim().replace(/\s+/g, ' ');
      if (!name || [...name].length > 16) return err('err.badName');
      if (room.players.length >= MAX_PLAYERS) return err('err.full');
      const base = name;
      for (let i = 2; room.players.some((x) => x.name.toLowerCase() === name.toLowerCase()); i++) name = base + ' ' + i;
      const used = room.players.map((x) => x.color);
      p = {
        id: 'p' + Math.random().toString(36).slice(2, 10), clientId, name,
        color: COLORS.find((c) => !used.includes(c)) || pick(COLORS),
        connected: true, socketId: null, score: 0
      };
      room.players.push(p);
    }
    if (p.socketId && p.socketId !== socket.id) {
      const old = io.sockets.sockets.get(p.socketId);
      if (old) { old.data.playerId = null; old.disconnect(true); }
    }
    p.socketId = socket.id;
    p.connected = true;
    socket.data.code = room.code;
    socket.data.playerId = p.id;
    socket.data.role = 'player';
    socket.join(room.code);
    if (!room.hostId) room.hostId = p.id;
    ensureHost(room);
    socket.emit('joined', { playerId: p.id, room: room.code });
    sync(room);
    emitTimer(room);
  });

  socket.on('player:looked', () => {
    const { room, player } = ctx();
    if (!room || !player || room.phase !== 'look' || !inRound(room, player.id)) return;
    if (!room.round.looked.includes(player.id)) { room.round.looked.push(player.id); sync(room); }
  });

  socket.on('player:word', (data) => {
    const { room, player } = ctx();
    if (!room || !player || room.phase !== 'words' || room.paused) return;
    const r = room.round;
    const turn = r.turns[r.turnIdx];
    if (!turn || turn.id !== player.id) return;
    const w = validWord(data && data.word);
    if (!w) return err('err.badWord');
    recordWord(room, w);
  });

  socket.on('player:vote', (data) => {
    const { room, player } = ctx();
    if (!room || !player || !VOTING_PHASES.includes(room.phase) || room.paused) return;
    const r = room.round;
    if (r.frozen || !inRound(room, player.id)) return;
    const target = data && data.targetId;
    if (target === player.id || !inRound(room, target)) return;
    if (r.candidates && !r.candidates.includes(target)) return;
    if (r.votes[player.id] === target) return;
    r.votes[player.id] = target;
    r.lastVoteChange = Date.now();
    if (room.timer && room.timer.speed > 1) room.timer.speed = 1;
    sync(room);
  });

  socket.on('player:guess', (data) => {
    const { room, player } = ctx();
    if (!room || !player || room.phase !== 'lastchance' || player.id !== room.round.alienId) return;
    const scene = SCENES.find((s) => s.id === room.round.sceneId);
    const itemId = data && data.itemId;
    if (!scene.items.some((i) => i.id === itemId)) return;
    room.round.guess = itemId;
    finishRound(room);
  });

  socket.on('host:start', asHost((room) => {
    if (!['lobby', 'roundEnd'].includes(room.phase)) return;
    if (!startRound(room)) err('err.notEnough', { min: MIN_PLAYERS });
  }));
  socket.on('host:next', asHost((room) => {
    if (room.phase !== 'roundEnd') return;
    if (!startRound(room)) err('err.notEnough', { min: MIN_PLAYERS });
  }));
  socket.on('host:lobby', asHost((room) => {
    if (room.phase === 'lobby') return;
    if (room.phase === 'roundEnd') { room.round = null; room.phase = 'lobby'; room.notice = null; clearTimer(room); return sync(room); }
    abortRound(room, 'abort.host');
  }));
  socket.on('host:pause', asHost((room) => {
    if (room.phase === 'lobby' || room.phase === 'roundEnd') return;
    room.paused = !room.paused;
    emitTimer(room);
    sync(room);
  }));
  socket.on('host:plus30', asHost((room) => {
    const r = room.round;
    if (!r || r.plus30Used || !room.timer || room.phase === 'roundEnd') return;
    r.plus30Used = true;
    room.timer.remaining += 30000 * TIME_SCALE;
    room.timer.total += 30000 * TIME_SCALE;
    emitTimer(room);
    sync(room);
  }));
  socket.on('host:kick', asHost((room, host, data) => {
    const target = getPlayer(room, data.playerId);
    if (!target || target.id === host.id) return;
    const s = target.socketId && io.sockets.sockets.get(target.socketId);
    if (s) { s.emit('kicked'); s.data.playerId = null; s.leave(room.code); }
    removePlayer(room, target.id);
  }));
  socket.on('host:settings', asHost((room, host, data) => {
    if (data.lang && ['ru', 'en'].includes(data.lang)) room.settings.lang = data.lang;
    if (data.pace && PACE[data.pace]) room.settings.pace = data.pace;
    sync(room);
  }));

  socket.on('disconnect', () => {
    const { room, player } = ctx();
    if (!room || !player || player.socketId !== socket.id) return;
    player.connected = false;
    player.socketId = null;
    // В лобби просто убираем ушедшего игрока; в игре ждём его возвращения
    if (room.phase === 'lobby') {
      setTimeout(() => {
        const p = getPlayer(room, player.id);
        if (p && !p.connected && room.phase === 'lobby') removePlayer(room, p.id);
      }, 15000);
    }
    ensureHost(room);
    sync(room);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const ip = lanIP();
  console.log('\n  👽  «Чужой» запущен!\n');
  console.log(`  Экран ТВ (откройте на телевизоре/ноутбуке):  http://${ip}:${PORT}/tv`);
  console.log(`  Локально на этом компьютере:                 http://localhost:${PORT}/tv`);
  console.log('  Телефоны подключаются по QR-коду с экрана ТВ (та же Wi-Fi сеть).\n');
});

module.exports = { server, rooms, T };
