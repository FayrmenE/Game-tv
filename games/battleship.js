'use strict';
/*
 * «Морской бой» (2 игрока, остальные — зрители).
 * Поле 10×10, флот: 1×4, 2×3, 3×2, 4×1. Корабли не касаются даже углами.
 * Попал — стреляешь ещё; промах — ход переходит. Вокруг потопленного корабля
 * клетки помечаются промахами автоматически. Побеждает тот, кто потопит весь флот.
 *
 * Секретность: расстановка игрока уходит только ему; ТВ и сопернику — лишь выстрелы
 * (и потопленные корабли). Полностью флоты показываются на ТВ только в конце.
 */
const { pick, randInt, shuffle } = require('../lib/util');

const N = 10;
const FLEET = [4, 3, 3, 2, 2, 2, 1, 1, 1, 1];
const T = { place: 120, shot: 30, end: 8 };

/* ------------------------------ поле ------------------------------ */

function shipCells(s) {
  const out = [];
  for (let i = 0; i < s.len; i++) out.push(s.dir === 'v' ? [s.r + i, s.c] : [s.r, s.c + i]);
  return out;
}

/** Проверка расстановки: состав флота, границы, без наложений и касаний. */
function validFleet(ships) {
  if (!Array.isArray(ships) || ships.length !== FLEET.length) return false;
  const lens = ships.map((s) => s && s.len).sort((a, b) => b - a);
  if (lens.join() !== FLEET.join()) return false;
  const grid = new Array(N * N).fill(-1);
  for (let k = 0; k < ships.length; k++) {
    const s = ships[k];
    if (!['h', 'v'].includes(s.dir) || !Number.isInteger(s.r) || !Number.isInteger(s.c)) return false;
    for (const [r, c] of shipCells(s)) {
      if (r < 0 || c < 0 || r >= N || c >= N) return false;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= N || cc >= N) continue;
        const o = grid[rr * N + cc];
        if (o !== -1 && o !== k) return false;
      }
    }
    for (const [r, c] of shipCells(s)) grid[r * N + c] = k;
  }
  return true;
}

function randomFleet() {
  for (let attempt = 0; attempt < 200; attempt++) {
    const ships = [];
    let ok = true;
    for (const len of FLEET) {
      let placed = false;
      for (let t = 0; t < 300 && !placed; t++) {
        const dir = Math.random() < 0.5 ? 'h' : 'v';
        const s = { len, dir, r: randInt(0, dir === 'v' ? N - len : N - 1), c: randInt(0, dir === 'h' ? N - len : N - 1) };
        const test = ships.concat([s]);
        // проверяем частично собранный флот теми же правилами
        if (partialOk(test)) { ships.push(s); placed = true; }
      }
      if (!placed) { ok = false; break; }
    }
    if (ok) return ships;
  }
  throw new Error('randomFleet failed');
}

function partialOk(ships) {
  const grid = new Array(N * N).fill(-1);
  for (let k = 0; k < ships.length; k++) {
    for (const [r, c] of shipCells(ships[k])) {
      if (r < 0 || c < 0 || r >= N || c >= N) return false;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= N || cc >= N) continue;
        const o = grid[rr * N + cc];
        if (o !== -1 && o !== k) return false;
      }
    }
    for (const [r, c] of shipCells(ships[k])) grid[r * N + c] = k;
  }
  return true;
}

/* ------------------------------ игра ------------------------------ */

function create(api) {
  const connected = api.players.filter((p) => p.connected);
  const humans = connected.filter((p) => !p.isBot);
  const host = humans.find((p) => p.id === api.hostId) || humans[0] || connected[0];
  const rest = connected.filter((p) => p !== host);
  // Соперник хоста: первый подключившийся человек, иначе бот
  const opp = rest.find((p) => !p.isBot) || rest[0];
  const G = {
    phase: 'place', turn: null, shotNo: 0, last: null, winner: null,
    order: [host.id, opp.id],
    side: {}, oppIdx: 0
  };
  const ts = Math.max(api.timeScale, 0.05);
  let jobs = [];
  const later = (ms, fn) => { const c = api.later(ms, fn); jobs.push(c); return c; };
  const cancelJobs = () => { jobs.forEach((c) => c()); jobs = []; };

  function initSide(id) {
    G.side[id] = { ships: randomFleet().map((s) => Object.assign(s, { hits: 0 })), ready: false, shots: {}, fired: 0, hitCount: 0 };
  }
  G.order.forEach(initSide);

  const enemyOf = (id) => G.order.find((x) => x !== id);
  const isPlayer = (id) => G.order.includes(id);
  const sunk = (s) => s.hits >= s.len;
  const aliveShips = (id) => G.side[id].ships.filter((s) => !sunk(s)).map((s) => s.len).sort((a, b) => b - a);

  function startPlace() {
    G.phase = 'place';
    api.setTimer(T.place, startBattle);
    api.sync();
  }

  function setFleet(player, ships) {
    if (G.phase !== 'place' || !isPlayer(player.id) || G.side[player.id].ready) return;
    const clean = (ships || []).map((s) => ({ len: s.len | 0, dir: s.dir === 'v' ? 'v' : 'h', r: s.r | 0, c: s.c | 0 }));
    if (!validFleet(clean)) return api.toPlayer(player.id, 'errorMsg', { key: 'bs.errFleet' });
    G.side[player.id].ships = clean.map((s) => Object.assign(s, { hits: 0 }));
    api.sync();
  }

  function ready(player) {
    if (G.phase !== 'place' || !isPlayer(player.id)) return;
    G.side[player.id].ready = true;
    api.sfx('ok');
    if (G.order.every((id) => G.side[id].ready)) startBattle();
    else api.sync();
  }

  function startBattle() {
    if (G.phase !== 'place') return;
    G.order.forEach((id) => { G.side[id].ready = true; });
    G.phase = 'battle';
    G.turn = pick(G.order);
    nextShotTimer();
    api.sync();
  }

  function nextShotTimer() {
    api.setTimer(T.shot, () => { const c = randomTarget(G.turn); if (c) fire(G.turn, c[0], c[1], true); });
  }

  function shipAt(id, r, c) {
    return G.side[id].ships.find((s) => shipCells(s).some(([rr, cc]) => rr === r && cc === c));
  }

  function fire(shooterId, r, c, auto) {
    if (G.phase !== 'battle' || shooterId !== G.turn) return;
    if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || c < 0 || r >= N || c >= N) return;
    const me = G.side[shooterId], foeId = enemyOf(shooterId), foe = G.side[foeId];
    const key = r * N + c;
    if (me.shots[key]) return;
    me.fired++;
    G.shotNo++;
    const ship = shipAt(foeId, r, c);
    let result = 'miss';
    if (ship) {
      ship.hits++;
      me.hitCount++;
      me.shots[key] = 'hit';
      result = 'hit';
      // По диагоналям от подбитой клетки корабля быть не может: корабли прямые и не касаются
      // даже углами. Отмечаем только эти 4 клетки — это точный вывод, а не подсказка.
      for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && cc >= 0 && rr < N && cc < N && !me.shots[rr * N + cc]) me.shots[rr * N + cc] = 'auto';
      }
      if (sunk(ship)) {
        result = 'sunk';
        // клетки корабля — «потоплен», вокруг — автоматические промахи
        for (const [sr, sc] of shipCells(ship)) {
          me.shots[sr * N + sc] = 'sunk';
          for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
            const rr = sr + dr, cc = sc + dc;
            if (rr < 0 || cc < 0 || rr >= N || cc >= N) continue;
            if (!me.shots[rr * N + cc]) me.shots[rr * N + cc] = 'auto';
          }
        }
      }
    } else me.shots[key] = 'miss';
    G.last = { by: shooterId, r, c, result, auto: !!auto, len: ship ? ship.len : 0, n: G.shotNo };
    // звук и анимацию выстрела ТВ проигрывает сам, по данным G.last
    if (!aliveShips(foeId).length) return endGame(shooterId);
    if (result === 'miss') G.turn = foeId;    // попал — стреляет ещё
    nextShotTimer();
    api.sync();
  }

  function randomTarget(id) {
    const shots = G.side[id].shots, free = [];
    for (let k = 0; k < N * N; k++) if (!shots[k]) free.push([Math.floor(k / N), k % N]);
    return free.length ? pick(free) : null;
  }

  function endGame(winnerId) {
    G.phase = 'end';
    G.winner = winnerId;
    api.sfx('win');
    api.setTimer(T.end, finish);
    api.sync();
  }

  function finish() {
    const [a, b] = G.order;
    const win = G.winner || (aliveShips(a).length >= aliveShips(b).length ? a : b);
    const lose = enemyOf(win);
    const acc = (id) => (G.side[id].fired ? G.side[id].hitCount / G.side[id].fired : 0);
    const sharp = acc(a) === acc(b) ? null : acc(a) > acc(b) ? a : b;
    api.finish({
      ranking: [[win], [lose]].filter((g) => api.getPlayer(g[0])),
      scores: { [a]: 20 - aliveShips(b).reduce((x, y) => x + y, 0), [b]: 20 - aliveShips(a).reduce((x, y) => x + y, 0) },
      titles: [
        { key: 'title.bs.admiral', playerId: win },
        sharp && { key: 'title.bs.sharp', playerId: sharp, vars: { p: Math.round(acc(sharp) * 100) } }
      ]
    });
  }

  /* ------------------------------ бот ------------------------------ */
  // Охота по «шахматке» + добивание: после попадания стреляет рядом, по линии
  function botTarget(id) {
    const shots = G.side[id].shots;
    const st = (r, c) => (r < 0 || c < 0 || r >= N || c >= N ? 'x' : shots[r * N + c]);
    const hits = [];
    for (let k = 0; k < N * N; k++) if (shots[k] === 'hit') hits.push([Math.floor(k / N), k % N]);
    if (hits.length) {
      const cands = [];
      if (hits.length >= 2) {
        const horiz = hits.every(([r]) => r === hits[0][0]);
        if (horiz) {
          const cs = hits.map((h) => h[1]); const r = hits[0][0];
          cands.push([r, Math.min(...cs) - 1], [r, Math.max(...cs) + 1]);
        } else {
          const rs = hits.map((h) => h[0]); const c = hits[0][1];
          cands.push([Math.min(...rs) - 1, c], [Math.max(...rs) + 1, c]);
        }
      }
      for (const [r, c] of hits) cands.push([r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]);
      const ok = cands.filter(([r, c]) => st(r, c) === undefined);
      if (ok.length) return ok[0];
    }
    const minLen = Math.min(...aliveShips(enemyOf(id)));
    const free = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!shots[r * N + c] && (minLen === 1 || (r + c) % 2 === 0)) free.push([r, c]);
    return free.length ? pick(free) : randomTarget(id);
  }

  /* ------------------------------ представления ------------------------------ */

  function shotsList(id) { return G.side[id].shots; }
  function fleetInfo(id) { return { left: aliveShips(id), total: FLEET.length }; }

  function tvView() {
    const v = {
      phase: G.phase, turn: G.turn, last: G.last, winner: G.winner, order: G.order,
      boards: {}
    };
    for (const id of G.order) {
      const foe = enemyOf(id);
      v.boards[id] = {
        ready: G.side[id].ready,
        shots: shotsList(foe),               // выстрелы соперника по флоту игрока
        fleet: fleetInfo(id),
        fired: G.side[id].fired, hits: G.side[id].hitCount,
        // корабли показываем только в конце партии; потопленные — сразу (их клетки уже известны)
        ships: G.phase === 'end' ? G.side[id].ships.map(({ r, c, len, dir, hits }) => ({ r, c, len, dir, sunk: hits >= len })) : null,
        sunkShips: G.side[id].ships.filter((s) => s.hits >= s.len).map(({ r, c, len, dir }) => ({ r, c, len, dir, sunk: true }))
      };
    }
    return v;
  }

  function playerView(p) {
    const base = tvView();
    if (!isPlayer(p.id)) { base.spectator = true; return base; }
    const foe = enemyOf(p.id);
    return Object.assign(base, {
      me: p.id, foe,
      myShips: G.side[p.id].ships.map(({ r, c, len, dir, hits }) => ({ r, c, len, dir, hits })),
      myShots: shotsList(p.id),
      foeShots: shotsList(foe),
      myReady: G.side[p.id].ready
    });
  }

  return {
    start() { startPlace(); },
    action(player, type, data) {
      if (type === 'fleet') setFleet(player, data.ships);
      else if (type === 'random') { if (G.phase === 'place' && isPlayer(player.id) && !G.side[player.id].ready) { initSide(player.id); api.sync(); } }
      else if (type === 'ready') ready(player);
      else if (type === 'fire') fire(player.id, data.r | 0, data.c | 0, false);
    },
    host(type) {
      // Сменить соперника хоста (до начала боя), если в комнате больше двух игроков
      if (type === 'bs:swap' && G.phase === 'place') {
        const others = api.players.filter((p) => p.connected && p.id !== G.order[0]);
        if (others.length < 2) return null;
        const i = (others.findIndex((p) => p.id === G.order[1]) + 1) % others.length;
        delete G.side[G.order[1]];
        G.order[1] = others[i].id;
        initSide(G.order[1]);
        api.sync();
      }
      return null;
    },
    tvView,
    playerView,
    leave(id) {
      if (!isPlayer(id) || G.phase === 'end') return api.sync();
      endGame(enemyOf(id));
    },
    bot(p) {
      if (!isPlayer(p.id)) return;
      const m = p.memo;
      if (G.phase === 'place' && !G.side[p.id].ready && !m.ready) { m.ready = true; later(randInt(2000, 6000) * ts, () => api.act(p, 'ready')); }
      if (G.phase === 'battle' && G.turn === p.id) {
        const k = 'shot' + G.shotNo;
        if (m[k]) return;
        m[k] = true;
        later(randInt(900, 2200) * ts, () => { if (G.turn === p.id) { const t = botTarget(p.id); if (t) api.act(p, 'fire', { r: t[0], c: t[1] }); } });
      }
    },
    destroy() { cancelJobs(); }
  };
}

module.exports = { create, validFleet, randomFleet, shipCells, FLEET, N };
