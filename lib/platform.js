'use strict';
/*
 * Платформа party-игр: общее ядро для всех игр набора.
 *
 *  - комнаты (код из 4 букв, QR), игроки, имена, аватарки, хост;
 *  - переподключение по токену (token хранится в localStorage телефона);
 *  - таймер фазы (с паузой и «скоростью») и точный планировщик later();
 *  - замер пинга (несколько замеров, медиана RTT);
 *  - меню выбора игры, пьедестал после партии, «Кубок вечера»;
 *  - тестовые боты (/tv?bots=N).
 *
 * Каждая игра — модуль games/<id>.js: create(api, opts) возвращает объект
 *   { start, action, host, tick, tvView, playerView, leave, join, tvJoin, bot, destroy }.
 * Вся игровая логика и таймеры живут на сервере. Секретное отдаётся только
 * через playerView(конкретный игрок); tvView не должен содержать секретов до раскрытия.
 */
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { pick, median, lanIP, shuffle } = require('./util');
const GAMES = require('../games');

const MAX_PLAYERS = 12;
const COLORS = ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93', '#ff924c', '#2ec4b6', '#f15bb5', '#9b5de5', '#00bbf9', '#e9c46a', '#adb5bd'];
const BOT_NAMES = ['Робо', 'Бип', 'Чип', 'Дейл', 'Пиксель', 'Байт', 'Гаджет', 'Винтик', 'Шпунтик', 'Кнопка', 'Флешка', 'Болт'];
const CUP_POINTS = [5, 3, 1];
const REACTIONS = ['😂', '🔥', '😱', '👏', '🤔', '😍', '💩', '🤯'];
const RULES_SEC = 25;
const MAX_AVATAR = 40000;           // символов data:URL (~30 КБ)
const SAVE_TTL = 12 * 3600 * 1000;  // комнаты на диске живут 12 часов

function attach(io, { port, timeScale = 1, minOverride = 0 }) {
  const rooms = new Map();

  function makeCode() {
    const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let c;
    do { c = Array.from({ length: 4 }, () => A[Math.floor(Math.random() * 26)]).join(''); } while (rooms.has(c));
    return c;
  }

  /* =========================== комната =========================== */

  function createRoom(code) {
    code = code || makeCode();
    const room = {
      code,
      joinUrl: `http://${lanIP()}:${port}/play?room=${code}`,
      qr: null,
      players: [], hostId: null,
      settings: { lang: 'ru', pace: 'normal', duelTarget: 15, big: false, contrast: false, customWords: [], customMode: 'mix' },
      rulesSeen: {}, rulesFor: null, reactAt: {}, ghosts: {},
      phase: 'menu',            // menu | rules | game | podium | evening
      selected: 'alien',        // выбранная в меню игра (id из GAMES)
      gameId: null, game: null, lastGameId: null,
      result: null,             // данные пьедестала
      cup: {},                  // id -> { name, color, points, games }
      paused: false, timer: null,
      jobs: new Set(),
      lastTick: Date.now(), lastTimerEmit: 0, emptySince: null,
      tvRtt: 0, syncPending: false, botTimer: null
    };
    rooms.set(code, room);
    QRCode.toDataURL(room.joinUrl, { margin: 1, width: 512, errorCorrectionLevel: 'M' })
      .then((url) => { room.qr = url; sync(room); })
      .catch((e) => console.error('QR error', e));
    return room;
  }

  /* =========================== сохранение на диск =========================== */
  // Кубок, игроки (с токенами) и настройки переживают перезапуск сервера.
  const SAVE_FILE = process.env.NO_SAVE ? null : (process.env.SAVE_FILE || path.join(process.cwd(), '.party-save.json'));
  let saveTimer = null;
  function save() {
    if (!SAVE_FILE || saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      const data = { savedAt: Date.now(), rooms: [...rooms.values()].filter((r) => r.players.some((p) => !p.isBot)).map((r) => ({
        code: r.code, settings: r.settings, cup: r.cup, rulesSeen: r.rulesSeen, lastGameId: r.lastGameId, selected: r.selected,
        players: r.players.map((p) => ({ id: p.id, token: p.token, name: p.name, color: p.color, avatar: p.avatar || null, isBot: p.isBot }))
      })) };
      fs.writeFile(SAVE_FILE, JSON.stringify(data), (e) => { if (e) console.error('save', e.message); });
    }, 500);
  }
  function load() {
    if (!SAVE_FILE) return;
    try {
      const data = JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8'));
      if (!data || Date.now() - data.savedAt > SAVE_TTL) return;
      for (const r of data.rooms || []) {
        if (rooms.has(r.code)) continue;
        const room = createRoom(r.code);
        Object.assign(room.settings, r.settings || {});
        room.cup = r.cup || {};
        room.rulesSeen = r.rulesSeen || {};
        room.lastGameId = r.lastGameId || null;
        room.selected = r.selected || 'alien';
        room.players = (r.players || []).map((p) => Object.assign({ connected: !!p.isBot, socketId: null, rtt: 0, memo: {} }, p));
        room.emptySince = Date.now();
        // Кто не вернулся за 10 минут — убираем из комнаты (очки Кубка остаются)
        setTimeout(() => {
          if (room.phase !== 'menu') return;
          room.players.filter((p) => !p.isBot && !p.connected).forEach((p) => removePlayer(room, p.id));
        }, 10 * 60 * 1000);
      }
      if (data.rooms && data.rooms.length) console.log(`  Восстановлено комнат: ${data.rooms.length} (Кубок вечера сохранён)`);
    } catch (e) { if (e.code !== 'ENOENT') console.error('load', e.message); }
  }

  const getPlayer = (room, id) => room.players.find((p) => p.id === id);
  const humans = (room) => room.players.filter((p) => !p.isBot);

  function ensureHost(room) {
    const h = getPlayer(room, room.hostId);
    if (h && h.connected && !h.isBot) return;
    const next = room.players.find((p) => p.connected && !p.isBot);
    if (next) room.hostId = next.id;
    else if (!h || h.isBot) room.hostId = null;
  }

  function addPlayer(room, name, extra) {
    const base = name;
    for (let i = 2; room.players.some((x) => x.name.toLowerCase() === name.toLowerCase()); i++) name = base + ' ' + i;
    const used = room.players.map((x) => x.color);
    const p = Object.assign({
      id: 'p' + Math.random().toString(36).slice(2, 10), token: null, name,
      color: COLORS.find((c) => !used.includes(c)) || pick(COLORS),
      connected: true, socketId: null, isBot: false, rtt: 0
    }, extra || {});
    room.players.push(p);
    return p;
  }

  function setAvatar(room, p, data) {
    const ok = typeof data === 'string' && data.length <= MAX_AVATAR && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(data);
    const next = ok ? data : null;
    if ((p.avatar || null) === next) return;
    p.avatar = next;
    io.to(room.code).emit('avatars', { [p.id]: next });
  }
  function avatarsOf(room) {
    const out = {};
    for (const p of room.players) if (p.avatar) out[p.id] = p.avatar;
    return out;
  }

  function addBots(room, n) {
    for (let i = 0; i < n && room.players.length < MAX_PLAYERS; i++) {
      const name = BOT_NAMES.find((b) => !room.players.some((p) => p.name === '🤖 ' + b)) || 'Бот';
      addPlayer(room, '🤖 ' + name, { isBot: true, memo: {} });
    }
    sync(room);
  }

  function removePlayer(room, id, opts) {
    const p = getPlayer(room, id);
    if (!p) return;
    room.players = room.players.filter((x) => x.id !== id);
    // Не выгнанный, а просто пропавший игрок (свернул браузер, погас экран) запоминается:
    // вернётся по своему токену — с тем же id, именем, аватаром и очками Кубка
    if (!(opts && opts.kick) && p.token && !p.isBot) { room.ghosts[p.token] = p; p.connected = false; p.socketId = null; }
    if (room.hostId === id) { room.hostId = null; ensureHost(room); }
    if (room.game && room.game.leave) room.game.leave(id);
    sync(room);
  }

  /* =========================== таймер и планировщик =========================== */

  function emitTimer(room) {
    room.lastTimerEmit = Date.now();
    const tm = room.timer;
    io.to(room.code).emit('timer', tm
      ? { remaining: Math.max(0, tm.remaining), total: tm.total, speed: tm.speed, paused: room.paused }
      : { remaining: 0, total: 0, speed: 1, paused: room.paused });
  }

  function setTimer(room, seconds, onEnd) {
    const ms = seconds * 1000 * timeScale;
    room.timer = { total: ms, remaining: ms, speed: 1, onEnd };
    emitTimer(room);
    return room.timer;
  }

  function clearTimer(room) { room.timer = null; emitTimer(room); }

  function runSafe(fn) { try { fn(); } catch (e) { console.error(e); } }

  function scheduleJob(room, job) {
    job.h = setTimeout(() => { room.jobs.delete(job); runSafe(job.fn); }, Math.max(0, job.due - Date.now()));
  }
  /** Точный таймаут, уважающий паузу. Возвращает функцию отмены. */
  function later(room, ms, fn) {
    const job = { fn, due: Date.now() + ms, h: null, left: 0 };
    room.jobs.add(job);
    if (!room.paused) scheduleJob(room, job);
    else job.left = ms;
    return () => { clearTimeout(job.h); room.jobs.delete(job); };
  }
  function clearJobs(room) { for (const j of room.jobs) clearTimeout(j.h); room.jobs.clear(); }

  function setPaused(room, paused) {
    if (room.paused === paused) return;
    room.paused = paused;
    const now = Date.now();
    for (const job of room.jobs) {
      if (paused) { clearTimeout(job.h); job.left = Math.max(0, job.due - now); }
      else { job.due = now + job.left; scheduleJob(room, job); }
    }
    if (room.game && room.game.onPause) room.game.onPause(paused);
    emitTimer(room);
    sync(room);
  }

  setInterval(() => {
    const now = Date.now();
    for (const room of rooms.values()) {
      const dt = now - room.lastTick;
      room.lastTick = now;
      const live = (room.phase === 'game' && room.game) || room.phase === 'rules';
      if (room.paused || !live) continue;
      if (room.game && room.game.tick) runSafe(() => room.game.tick(now));
      const tm = room.timer;
      if (!tm) continue;
      tm.remaining -= dt * tm.speed;
      if (tm.remaining <= 0) {
        if (room.timer === tm) room.timer = null;
        runSafe(tm.onEnd);
      } else if (now - room.lastTimerEmit > 250) emitTimer(room);
    }
  }, 100);

  // Уборка пустых комнат
  setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
      const tvs = io.sockets.adapter.rooms.get('tv:' + code);
      const anyone = (tvs && tvs.size) || humans(room).some((p) => p.connected);
      if (anyone) room.emptySince = null;
      else if (!room.emptySince) room.emptySince = now;
      else if (now - room.emptySince > 30 * 60 * 1000) { destroyGame(room); rooms.delete(code); }
    }
  }, 60 * 1000);

  /* =========================== пинг =========================== */

  /** Несколько замеров RTT до телефонов и ТВ, медиана. Боты — 0. */
  function measurePing(room, rounds = 7) {
    return new Promise((resolve) => {
      const samples = {};
      const tvSamples = [];
      const targets = room.players.filter((p) => p.socketId && p.connected);
      let r = 0;
      const once = () => {
        const sent = Date.now();
        for (const p of targets) {
          const s = io.sockets.sockets.get(p.socketId);
          if (!s) continue;
          s.timeout(1000).emit('ping2', sent, (err) => { if (!err) (samples[p.id] = samples[p.id] || []).push(Date.now() - sent); });
        }
        const tvRoom = io.sockets.adapter.rooms.get('tv:' + room.code);
        const tvId = tvRoom && [...tvRoom][0];
        const tv = tvId && io.sockets.sockets.get(tvId);
        if (tv) tv.timeout(1000).emit('ping2', sent, (err) => { if (!err) tvSamples.push(Date.now() - sent); });
        if (++r < rounds) setTimeout(once, 120);
        else setTimeout(() => {
          for (const p of room.players) p.rtt = samples[p.id] ? median(samples[p.id]) : 0;
          room.tvRtt = median(tvSamples);
          resolve({ players: Object.fromEntries(room.players.map((p) => [p.id, p.rtt])), tv: room.tvRtt });
        }, 600);
      };
      once();
    });
  }

  /* =========================== игры =========================== */

  function gameMeta(id) { return GAMES[id]; }
  function minFor(meta) { return minOverride || meta.min; }

  function makeApi(room) {
    // После конца партии модуль может ещё держать колбэки (например, ответ пинга).
    // Все вызовы «мёртвого» экземпляра игнорируются, чтобы он не трогал следующую игру.
    let dead = false;
    const live = (fn) => (...args) => (dead ? undefined : fn(...args));
    const api = {
      code: room.code,
      get settings() { return room.settings; },
      get players() { return room.players; },
      getPlayer: (id) => getPlayer(room, id),
      get hostId() { return room.hostId; },
      get paused() { return room.paused; },
      get timer() { return dead ? null : room.timer; },
      setTimer: live((sec, fn) => setTimer(room, sec, live(fn))),
      clearTimer: live(() => clearTimer(room)),
      emitTimer: live(() => emitTimer(room)),
      timeScale,
      later: (ms, fn) => (dead ? () => {} : later(room, ms, live(fn))),
      sync: live(() => sync(room)),
      toTv: live((ev, data) => io.to('tv:' + room.code).emit(ev, data)),
      toPlayer: live((id, ev, data) => { const p = getPlayer(room, id); if (p && p.socketId) io.to(p.socketId).emit(ev, data); }),
      toAll: live((ev, data) => io.to(room.code).emit(ev, data)),
      sfx: live((kind, target) => {
        if (!target || target === 'tv') io.to('tv:' + room.code).emit('sfx', kind);
        else api.toPlayer(target, 'sfx', kind);
      }),
      measurePing: (rounds) => measurePing(room, rounds),
      get tvRtt() { return room.tvRtt; },
      finish: live((result) => finishGame(room, result)),
      /** Действие от имени игрока (используют боты) */
      act: live((player, type, data) => handleAction(room, player, type, data || {})),
      abortToMenu: live(() => backToMenu(room)),
      kill() { dead = true; }
    };
    return api;
  }

  function startGame(room, id, opts) {
    const meta = gameMeta(id);
    if (!meta) return 'err.noGame';
    const n = room.players.filter((p) => p.connected).length;
    if (n < minFor(meta)) return 'err.notEnough';
    if (n > meta.max) return 'err.tooMany';
    // Перед первой партией каждой игры (или по кнопке «Правила») — экран «Как играть»
    if ((opts && opts.rules) || (!room.rulesSeen[id] && !(opts && opts.skipRules))) {
      destroyGame(room);
      room.phase = 'rules';
      room.rulesFor = id;
      room.result = null;
      room.rulesSeen[id] = true;
      save();
      setTimer(room, RULES_SEC, () => {
        if (room.phase !== 'rules') return;
        if (startGame(room, id, { skipRules: true })) backToMenu(room);   // за время правил игроки ушли
      });
      sync(room);
      return null;
    }
    destroyGame(room);
    room.rulesFor = null;
    room.gameId = id;
    room.lastGameId = id;
    room.phase = 'game';
    room.result = null;
    room.paused = false;
    for (const p of room.players) if (p.isBot) p.memo = {};
    room.api = makeApi(room);
    room.game = meta.create(room.api, meta.opts || {});
    room.game.start();
    sync(room);
    return null;
  }

  function destroyGame(room) {
    if (room.game && room.game.destroy) runSafe(() => room.game.destroy());
    if (room.api) { room.api.kill(); room.api = null; }
    room.game = null;
    clearJobs(room);
    room.timer = null;
    room.paused = false;
    emitTimer(room);
  }

  function backToMenu(room) {
    destroyGame(room);
    room.phase = 'menu';
    room.rulesFor = null;
    room.gameId = null;
    sync(room);
  }

  /**
   * Конец партии. result = { ranking: [[ids]] (группы по местам; для командных игр — команды),
   *   scores: {id: number}, teams?: [{name,color,ids,score}], titles: [{key, playerId, value?}] }
   */
  function finishGame(room, result) {
    const gameId = room.gameId;
    const places = [];
    let place = 1;
    for (const group of result.ranking) {
      const ids = group.filter((id) => getPlayer(room, id));
      if (!ids.length) continue;
      places.push({ place, ids });
      place += result.teams ? 1 : ids.length;
    }
    const cupDelta = {};
    for (const { place: pl, ids } of places) {
      const pts = CUP_POINTS[pl - 1] || 0;
      for (const id of ids) {
        const p = getPlayer(room, id);
        const c = room.cup[id] = room.cup[id] || { name: p.name, color: p.color, points: 0, games: 0 };
        c.name = p.name; c.color = p.color;
        c.points += pts;
        cupDelta[id] = pts;
      }
    }
    for (const p of room.players) if (room.cup[p.id]) room.cup[p.id].games++;
    destroyGame(room);
    room.phase = 'podium';
    save();
    room.result = {
      gameId, places, cupDelta,
      scores: result.scores || {},
      teams: result.teams || null,
      titles: (result.titles || []).filter((t) => t && t.playerId && getPlayer(room, t.playerId))
    };
    sync(room);
  }

  /* =========================== представления =========================== */

  function cupTable(room) {
    return Object.entries(room.cup)
      .map(([id, c]) => ({ id, name: c.name, color: c.color, points: c.points }))
      .sort((a, b) => b.points - a.points);
  }

  function baseView(room) {
    return {
      code: room.code, phase: room.phase, gameId: room.gameId, selected: room.selected, lastGameId: room.lastGameId,
      hostId: room.hostId, settings: room.settings, paused: room.paused, rulesFor: room.rulesFor,
      players: room.players.map((p) => ({ id: p.id, name: p.name, color: p.color, connected: p.connected, isBot: p.isBot, av: !!p.avatar })),
      reactions: REACTIONS,
      games: Object.values(GAMES).map((g) => ({ id: g.id, min: minFor(g), max: g.max, label: g.label || null })),
      maxPlayers: MAX_PLAYERS,
      cup: cupTable(room),
      result: room.result
    };
  }

  function sync(room) {
    // Склеиваем частые вызовы в один кадр рассылки
    if (room.syncPending) return;
    room.syncPending = true;
    setImmediate(() => { room.syncPending = false; doSync(room); });
  }

  function doSync(room) {
    const base = baseView(room);
    const g = room.phase === 'game' && room.game;
    let tvGame = null;
    try { tvGame = g ? g.tvView() : null; } catch (e) { console.error(e); }
    io.to('tv:' + room.code).emit('state', Object.assign({}, base, { joinUrl: room.joinUrl, qr: room.qr, game: tvGame }));
    for (const p of room.players) {
      if (!p.socketId && !p.isBot) continue;
      let pv = null;
      try { pv = g ? g.playerView(p) : null; } catch (e) { console.error(e); }
      const me = { id: p.id, name: p.name, color: p.color, isHost: room.hostId === p.id };
      if (p.isBot) {
        if (g && g.bot) runSafe(() => g.bot(p, pv));
      } else io.to(p.socketId).emit('state', Object.assign({}, base, { me, game: pv }));
    }
  }

  /* =========================== сокеты =========================== */

  io.on('connection', (socket) => {
    const ctx = () => {
      const room = rooms.get(socket.data.code);
      if (!room) return {};
      return { room, player: getPlayer(room, socket.data.playerId) };
    };
    const err = (key, vars) => socket.emit('errorMsg', { key, vars });

    // Диагностика (/check): эхо для замера пинга
    socket.on('diag:ping', (ack) => { if (typeof ack === 'function') ack(); });

    socket.on('tv:hello', (data) => {
      data = data || {};
      let room = data.code && rooms.get(String(data.code).toUpperCase());
      const fresh = !room;
      if (!room) room = createRoom();
      socket.data.code = room.code;
      socket.data.role = 'tv';
      socket.join(room.code);
      socket.join('tv:' + room.code);
      const bots = Math.min(MAX_PLAYERS, Math.max(0, parseInt(data.bots, 10) || 0));
      const have = room.players.filter((p) => p.isBot).length;
      if (bots > have && (fresh || room.phase === 'menu')) addBots(room, bots - have);
      if (room.game && room.game.tvJoin) room.game.tvJoin(socket);
      socket.emit('avatars', avatarsOf(room));
      sync(room);
      emitTimer(room);
    });

    socket.on('player:join', (data) => {
      data = data || {};
      const room = rooms.get(String(data.room || '').toUpperCase().trim());
      if (!room) return err('err.noRoom');
      const token = String(data.token || '').slice(0, 64);
      let p = token && room.players.find((x) => x.token === token);
      let isNew = false;
      if (!p && token && room.ghosts[token] && room.players.length < MAX_PLAYERS) {
        p = room.ghosts[token];
        delete room.ghosts[token];
        room.players.push(p);
      }
      if (!p) {
        const name = String(data.name || '').trim().replace(/\s+/g, ' ');
        if (!name || [...name].length > 16) return err('err.badName');
        if (room.players.length >= MAX_PLAYERS) return err('err.full');
        p = addPlayer(room, name, { token });
        isNew = true;
      }
      if (data.avatar !== undefined) setAvatar(room, p, data.avatar);
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
      ensureHost(room);
      socket.emit('joined', { playerId: p.id, room: room.code });
      if (room.game && room.game.join) room.game.join(p, isNew);
      socket.emit('avatars', avatarsOf(room));
      if (isNew) save();
      sync(room);
      emitTimer(room);
    });

    // Свой нарисованный аватар
    socket.on('avatar', (data) => {
      const { room, player } = ctx();
      if (!room || !player) return;
      setAvatar(room, player, data && data.avatar);
      save();
      sync(room);
    });

    // Реакции эмодзи: всплывают на ТВ
    socket.on('react', (data) => {
      const { room, player } = ctx();
      if (!room || !player || !data || !REACTIONS.includes(data.e)) return;
      const now = Date.now();
      if (room.reactAt[player.id] && now - room.reactAt[player.id] < 600) return;
      room.reactAt[player.id] = now;
      io.to('tv:' + room.code).emit('react', { id: player.id, e: data.e });
    });

    // Игровое действие игрока
    socket.on('action', (msg) => {
      const { room, player } = ctx();
      if (!room || !player || !msg || typeof msg.type !== 'string') return;
      handleAction(room, player, msg.type, msg.data || {});
    });

    // Действие хоста
    socket.on('host', (msg) => {
      const { room, player } = ctx();
      if (!room || !player || !msg) return;
      if (room.hostId !== player.id) return err('err.notHost');
      const e = hostAction(room, player, String(msg.type), msg.data || {});
      if (e) err(e.key || e, e.vars);
    });

    socket.on('disconnect', () => {
      const { room, player } = ctx();
      if (!room || !player || player.socketId !== socket.id) return;
      player.connected = false;
      player.socketId = null;
      if (room.phase === 'menu') {
        setTimeout(() => {
          const p = getPlayer(room, player.id);
          if (p && !p.connected && room.phase === 'menu') removePlayer(room, p.id);
        }, Number(process.env.MENU_DROP_MS) || 3 * 60 * 1000);
      }
      ensureHost(room);
      if (room.game && room.game.disconnect) room.game.disconnect(player.id);
      sync(room);
    });
  });

  function handleAction(room, player, type, data) {
    if (room.phase !== 'game' || !room.game) return;
    if (room.paused && type !== 'pong') return;
    room.game.action(player, type, data, Date.now());
  }

  function hostAction(room, host, type, data) {
    const ph = room.phase;
    switch (type) {
      case 'select':
        if (ph === 'menu' && GAMES[data.gameId]) { room.selected = data.gameId; sync(room); }
        return null;
      case 'start': {
        if (ph !== 'menu') return null;
        const id = GAMES[data.gameId] ? data.gameId : room.selected;
        room.selected = id;
        const e = startGame(room, id);
        return e ? { key: e, vars: { min: minFor(GAMES[id]), max: GAMES[id].max } } : null;
      }
      case 'skipRules':
        if (ph === 'rules' && room.rulesFor) { const e = startGame(room, room.rulesFor, { skipRules: true }); return e ? { key: e } : null; }
        return null;
      case 'rules': {
        if (ph !== 'menu') return null;
        const id = GAMES[data.gameId] ? data.gameId : room.selected;
        const e = startGame(room, id, { rules: true });
        return e ? { key: e, vars: { min: minFor(GAMES[id]), max: GAMES[id].max } } : null;
      }
      case 'again': {
        if (ph !== 'podium' || !room.lastGameId) return null;
        const e = startGame(room, room.lastGameId, { skipRules: true });
        return e ? { key: e, vars: { min: minFor(GAMES[room.lastGameId]), max: GAMES[room.lastGameId].max } } : null;
      }
      case 'menu':
        if (ph === 'game' || ph === 'podium' || ph === 'evening' || ph === 'rules') backToMenu(room);
        return null;
      case 'evening':
        if (ph === 'podium' || ph === 'menu') { destroyGame(room); room.phase = 'evening'; sync(room); }
        return null;
      case 'pause':
        if (ph === 'game') setPaused(room, !room.paused);
        return null;
      case 'kick': {
        const target = getPlayer(room, data.playerId);
        if (!target || target.id === host.id) return null;
        const s = target.socketId && io.sockets.sockets.get(target.socketId);
        if (s) { s.emit('kicked'); s.data.playerId = null; s.leave(room.code); }
        removePlayer(room, target.id, { kick: true });
        save();
        return null;
      }
      case 'addBot':
        if (ph === 'menu') addBots(room, 1);
        return null;
      case 'settings':
        if (data.lang && ['ru', 'en'].includes(data.lang)) room.settings.lang = data.lang;
        if (data.pace && ['fast', 'normal', 'long'].includes(data.pace)) room.settings.pace = data.pace;
        if ([10, 15, 20].includes(Number(data.duelTarget))) room.settings.duelTarget = Number(data.duelTarget);
        if (typeof data.big === 'boolean') room.settings.big = data.big;
        if (typeof data.contrast === 'boolean') room.settings.contrast = data.contrast;
        if (['mix', 'only'].includes(data.customMode)) room.settings.customMode = data.customMode;
        if (typeof data.customWords === 'string') {
          // Свои слова для «Крокодила»: через запятую или с новой строки
          const seen = new Set();
          room.settings.customWords = data.customWords.split(/[,;\n]+/).map((w) => w.trim().replace(/\s+/g, ' ').slice(0, 30))
            .filter((w) => w && !seen.has(w.toLowerCase()) && seen.add(w.toLowerCase())).slice(0, 200);
        }
        save();
        sync(room);
        return null;
      default:
        // Остальное — команды хоста конкретной игре
        if (ph === 'game' && room.game && room.game.host) return room.game.host(type, data, host) || null;
        return null;
    }
  }

  load();
  return { rooms, handleAction, hostAction, shuffle, REACTIONS };
}

module.exports = { attach, MAX_PLAYERS };
