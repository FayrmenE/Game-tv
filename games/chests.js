'use strict';
/*
 * «Сундуки» (3–12): блеф и тайные ставки.
 * Фазы раунда: inspect (Смотритель смотрит сундук) → discuss (рассказывает, может врать) →
 * bid (тайные ставки) → reveal (ставки, затем сундук) → [thief (выбор цели Вора)] → следующий.
 *
 * Секретность: содержимое сундука до раскрытия — только в playerView Смотрителя;
 * чужие ставки до раскрытия не уходят никому (ни ТВ, ни телефонам).
 * Вся математика раунда — в chests-logic.js (чистые функции, покрыты тестами).
 */
const L = require('./chests-logic');
const { pick, randInt } = require('../lib/util');

const T = { inspect: 10, bid: 15, revealBids: 3, revealChest: 4, thief: 15, finale: 9 };

function create(api) {
  const S = api.settings;
  const rounds = S.chestsRounds === 2 ? 2 : 3;
  const discussSec = S.chestsDiscuss === 30 ? 30 : 40;
  const hard = !!S.chestsHard;
  // порядок Смотрителей — порядок входа в комнату
  const order = api.players.filter((p) => p.connected).map((p) => p.id);
  const total = order.length * rounds;
  const deck = L.makeDeck();
  const G = {
    phase: 'inspect', idx: 0, total, rounds, discussSec, hard,
    coins: Object.fromEntries(order.map((id) => [id, L.START_COINS])),
    keeper: null, card: null, bids: {}, touched: {}, result: null, thief: null,
    history: [],            // сыгранные сундуки: { key, keeper, recipient, outcome }
    stats: { keeperEarn: {}, worstLoss: null, passes: {} },
    end: null
  };
  let jobs = [];
  const later = (ms, fn) => { const c = api.later(ms, fn); jobs.push(c); return c; };
  const cancelJobs = () => { jobs.forEach((c) => c()); jobs = []; };
  const ts = Math.max(api.timeScale, 0.05);
  const has = (id) => G.coins[id] != null;

  /* ------------------------------ раунд ------------------------------ */

  function startChest() {
    cancelJobs();
    G.keeper = order[G.idx % order.length];
    G.card = deck[G.idx];
    G.bids = {}; G.touched = {}; G.result = null; G.thief = null;
    G.phase = 'inspect';
    api.setTimer(T.inspect, startDiscuss);
    api.sync();
  }

  function startDiscuss() {
    if (G.phase !== 'inspect') return;
    G.phase = 'discuss';
    api.setTimer(discussSec, startBid);
    api.sync();
  }

  function startBid() {
    if (G.phase !== 'discuss') return;
    G.phase = 'bid';
    G.bidders = L.eligibleBidders(G.coins, G.keeper, order);
    G.bidders.forEach((id) => { G.bids[id] = 0; });
    if (!G.bidders.length) return reveal();          // ставить некому — сундук достаётся Смотрителю
    api.setTimer(T.bid, reveal);
    api.sync();
  }

  function setBid(player, value) {
    if (G.phase !== 'bid' || !G.bidders.includes(player.id)) return;
    G.bids[player.id] = L.clampBid(value, G.coins[player.id]);
    G.touched[player.id] = true;
    api.toPlayer(player.id, 'chests:bid', { bid: G.bids[player.id] });   // «ставка принята»
    api.sync();
  }

  function reveal() {
    if (G.phase !== 'bid' && G.phase !== 'discuss') return;
    const before = Object.assign({}, G.coins);
    const bids = {};
    (G.bidders || []).forEach((id) => { bids[id] = G.bids[id] || 0; });
    const r = L.applyRound(G.coins, G.keeper, bids, G.card, hard);
    G.coins = r.coins;
    G.result = Object.assign({ bids, before }, r);
    // статистика
    G.stats.keeperEarn[G.keeper] = (G.stats.keeperEarn[G.keeper] || 0) + r.keeperGot;
    (G.bidders || []).forEach((id) => { if (!bids[id]) G.stats.passes[id] = (G.stats.passes[id] || 0) + 1; });
    G.history.push({ key: L.cardKey(G.card), keeper: G.keeper, recipient: r.recipient, outcome: r.outcome.type });
    G.phase = 'reveal';
    api.sfx('drum');
    api.setTimer(T.revealBids + T.revealChest, afterReveal);
    later((T.revealBids * 1000) * ts, () => api.sfx(G.card.kind === 'coins' && G.card.v > 0 ? 'win' : G.card.kind === 'coins' && G.card.v === 0 ? 'pop' : 'lose'));
    api.sync();
  }

  function afterReveal() {
    if (G.phase !== 'reveal') return;
    if (G.result.needThief) {
      G.phase = 'thief';
      G.thief = { id: G.result.recipient, targets: L.thiefTargets(G.coins, G.result.recipient), target: null, stolen: 0 };
      api.setTimer(T.thief, () => chooseTarget(G.thief.id, pick(G.thief.targets)));
      return api.sync();
    }
    nextChest();
  }

  function chooseTarget(thiefId, targetId) {
    if (G.phase !== 'thief' || thiefId !== G.thief.id || !G.thief.targets.includes(targetId)) return;
    const r = L.applyThief(G.coins, thiefId, targetId);
    G.coins = r.coins;
    Object.assign(G.thief, { target: r.target, stolen: r.stolen });
    G.result.delta[thiefId] = (G.result.delta[thiefId] || 0) + r.stolen;
    G.result.delta[targetId] = (G.result.delta[targetId] || 0) - r.stolen;
    G.phase = 'stolen';
    api.sfx('boom');
    api.setTimer(3, nextChest);
    api.sync();
  }

  function nextChest() {
    // самая дорогая ошибка: максимальная потеря одного игрока на одном сундуке
    for (const [id, d] of Object.entries(G.result.delta)) {
      if (d < 0 && (!G.stats.worstLoss || -d > G.stats.worstLoss.loss)) G.stats.worstLoss = { id, loss: -d, key: L.cardKey(G.card) };
    }
    G.idx++;
    const e = L.checkEnd(G.coins, G.idx, total);
    if (e.over) return finale(e);
    startChest();
  }

  function finale(e) {
    cancelJobs();
    G.end = e;
    G.phase = 'final';
    api.sfx('win');
    api.setTimer(T.finale, finish);
    api.sync();
  }

  function bestBy(obj, minV) {
    const e = Object.entries(obj).filter(([id, v]) => v > (minV || 0) && api.getPlayer(id)).sort((a, b) => b[1] - a[1])[0];
    return e || null;
  }

  function finish() {
    const ids = order.filter((id) => api.getPlayer(id));
    const coins = Object.fromEntries(ids.map((id) => [id, G.coins[id] || 0]));
    let ranking;
    if (G.end && G.end.reason === 'draw') ranking = [ids];
    else if (G.end && G.end.reason === 'last') ranking = [[G.end.winner]].concat(L.finalRanking(Object.fromEntries(ids.filter((x) => x !== G.end.winner).map((x) => [x, coins[x]])), G.stats.keeperEarn));
    else ranking = L.finalRanking(coins, G.stats.keeperEarn);
    const keeper = bestBy(G.stats.keeperEarn), passer = bestBy(G.stats.passes), worst = G.stats.worstLoss;
    api.finish({
      ranking, scores: coins,
      titles: [
        keeper && { key: 'title.chests.keeper', playerId: keeper[0], vars: { n: keeper[1] } },
        worst && { key: 'title.chests.worst', playerId: worst.id, vars: { n: worst.loss } },
        passer && { key: 'title.chests.passer', playerId: passer[0], vars: { n: passer[1] } }
      ]
    });
  }

  /* ------------------------------ представления ------------------------------ */

  function common() {
    const r = G.result;
    const v = {
      phase: G.phase, idx: G.idx, total, rounds, circle: Math.floor(G.idx / order.length) + 1,
      inCircle: (G.idx % order.length) + 1, perCircle: order.length, hard, discussSec,
      keeper: G.keeper, order: order.filter((id) => api.getPlayer(id)), coins: G.coins,
      deck: L.deckComposition(), out: G.history.map((h) => h.key),
      bidders: G.phase === 'bid' ? G.bidders : null,
      touched: G.phase === 'bid' ? Object.keys(G.touched) : []
    };
    if (r && G.phase !== 'inspect' && G.phase !== 'discuss' && G.phase !== 'bid') {
      // после раскрытия — всё открыто
      Object.assign(v, {
        card: L.cardKey(G.card), bids: r.bids, outcome: r.outcome, recipient: r.recipient,
        paid: r.paid, keeperGot: r.keeperGot, burned: r.burned, mimicPaid: r.mimicPaid, delta: r.delta, needThief: r.needThief,
        thief: G.thief && { id: G.thief.id, target: G.thief.target, stolen: G.thief.stolen }
      });
    }
    if (G.phase === 'final') Object.assign(v, { end: G.end, stats: statsView() });
    return v;
  }

  function statsView() {
    const k = bestBy(G.stats.keeperEarn), p = bestBy(G.stats.passes);
    return { keeper: k && { id: k[0], n: k[1] }, worst: G.stats.worstLoss, passer: p && { id: p[0], n: p[1] } };
  }

  return {
    start() { startChest(); },
    action(player, type, data) {
      if (!has(player.id)) return;
      if (type === 'ready' && G.phase === 'inspect' && player.id === G.keeper) startDiscuss();
      else if (type === 'skip' && G.phase === 'discuss' && player.id === G.keeper) startBid();
      else if (type === 'bid') setBid(player, data.bid);
      else if (type === 'steal') chooseTarget(player.id, data.target);
    },
    tvView: common,
    playerView(p) {
      if (!has(p.id)) return { spectator: true, phase: G.phase };
      const v = common();
      v.me = p.id;
      v.role = p.id === G.keeper ? 'keeper' : (G.coins[p.id] || 0) <= 0 ? 'bankrupt' : 'bidder';
      // содержимое сундука до раскрытия — только Смотрителю (переподключение: увидит снова)
      if (p.id === G.keeper && ['inspect', 'discuss', 'bid'].includes(G.phase)) v.secret = L.cardKey(G.card);
      if (G.phase === 'bid') v.myBid = G.bidders.includes(p.id) ? (G.bids[p.id] || 0) : null;
      if (G.phase === 'bid') v.myTouched = !!G.touched[p.id];
      if (G.phase === 'thief' && G.thief.id === p.id) v.targets = G.thief.targets;
      return v;
    },
    leave(id) {
      // ушедший игрок выбывает: его ставка — 0, его очередь Смотрителя пропускается
      if (G.phase === 'bid' && G.bidders) G.bidders = G.bidders.filter((x) => x !== id);
      if (G.phase === 'thief' && G.thief && G.thief.id === id) return chooseTarget(id, pick(G.thief.targets));
      if (order.filter((x) => api.getPlayer(x)).length < 2) return finale({ over: true, reason: 'rounds' });
      api.sync();
    },
    bot(p) {
      if (!has(p.id)) return;
      const m = p.memo, key = G.idx + ':' + G.phase;
      const once = (k, ms, fn) => { if (m[k]) return; m[k] = true; later(ms, fn); };
      if (G.phase === 'inspect' && G.keeper === p.id) once(key, randInt(1500, 4000) * ts, () => api.act(p, 'ready'));
      if (G.phase === 'discuss' && G.keeper === p.id && order.every((id) => (api.getPlayer(id) || {}).isBot)) once(key, 3000 * ts, () => api.act(p, 'skip'));
      if (G.phase === 'bid' && G.bidders.includes(p.id)) {
        const have = G.coins[p.id];
        const r = Math.random();
        const bid = r < 0.35 ? 0 : Math.min(have, r < 0.8 ? randInt(5, 25) : randInt(20, 45));
        once(key, randInt(1500, 9000) * ts, () => api.act(p, 'bid', { bid }));
      }
      if (G.phase === 'thief' && G.thief.id === p.id) once(key, randInt(1500, 4000) * ts, () => {
        const best = G.thief.targets.slice().sort((a, b) => G.coins[b] - G.coins[a])[0];
        api.act(p, 'steal', { target: best });
      });
    },
    destroy() { cancelJobs(); }
  };
}

module.exports = { create };
