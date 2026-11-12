'use strict';
/*
 * «Сундуки» — чистая логика без сокетов и таймеров (покрыта тестами test/chests.test.js).
 * Монеты — объект { id: число }. Все функции возвращают новые объекты, входные не меняют.
 */

const START_COINS = 100;
const THIEF_STEAL = 15;

/** Состав колоды: 40 сундуков */
const DECK_SPEC = [
  { kind: 'coins', v: 10, n: 5 }, { kind: 'coins', v: 20, n: 5 }, { kind: 'coins', v: 30, n: 3 }, { kind: 'coins', v: 50, n: 2 },
  { kind: 'coins', v: 0, n: 4 },
  { kind: 'coins', v: -10, n: 5 }, { kind: 'coins', v: -20, n: 5 }, { kind: 'coins', v: -30, n: 3 },
  { kind: 'thief', n: 4 }, { kind: 'mimic', n: 4 }
];

/** Ключ вида сундука: '+20', '0', '-10', 'thief', 'mimic' */
function cardKey(c) {
  if (c.kind !== 'coins') return c.kind;
  return c.v > 0 ? '+' + c.v : String(c.v);
}

function makeDeck(rnd = Math.random) {
  const deck = [];
  for (const s of DECK_SPEC) for (let i = 0; i < s.n; i++) deck.push(s.kind === 'coins' ? { kind: 'coins', v: s.v } : { kind: s.kind });
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  return deck;
}

/** Состав колоды для панели «Вышло»: [{key, total}] */
function deckComposition() {
  return DECK_SPEC.map((s) => ({ key: cardKey(s), total: s.n }));
}

/** Кто может ставить: не Смотритель и не банкрот */
function eligibleBidders(coins, keeperId, order) {
  return order.filter((id) => id !== keeperId && (coins[id] || 0) > 0);
}

/** Приводим ставку к допустимой: целое от 0 до своих монет */
function clampBid(bid, have) {
  const n = Math.floor(Number(bid));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, Math.max(0, have));
}

/**
 * Разбор ставок. bids: { id: ставка } (только допущенные игроки).
 * → { type: 'win', winner, price } | { type: 'tie', ids, price } | { type: 'free', recipient: keeperId }
 */
function resolveBids(bids, keeperId) {
  const max = Math.max(0, ...Object.values(bids).map((v) => v || 0));
  if (max <= 0) return { type: 'free', recipient: keeperId };
  const top = Object.keys(bids).filter((id) => bids[id] === max);
  if (top.length > 1) return { type: 'tie', ids: top, price: max };
  return { type: 'win', winner: top[0], recipient: top[0], price: max };
}

/**
 * Применить раунд: оплата Смотрителю, затем содержимое сундука получателю.
 * Вор здесь не применяется — для него нужен выбор цели (applyThief).
 * → { coins, outcome, recipient, paid, keeperGot, burned, mimicPaid, needThief, delta }
 */
function applyRound(coins0, keeperId, bids, card, hard) {
  const coins = Object.assign({}, coins0);
  const outcome = resolveBids(bids, keeperId);
  const res = { outcome, recipient: null, paid: 0, keeperGot: 0, burned: 0, mimicPaid: 0, needThief: false };
  if (outcome.type === 'tie') return finish(res, coins0, coins);   // сундук сгорает, никто не платит
  const r = outcome.recipient;
  res.recipient = r;
  if (outcome.type === 'win') {
    const price = Math.min(outcome.price, coins[r] || 0);
    coins[r] = (coins[r] || 0) - price;
    res.paid = price;
    res.keeperGot = hard ? Math.floor(price / 2) : price;
    res.burned = price - res.keeperGot;
    coins[keeperId] = (coins[keeperId] || 0) + res.keeperGot;
  }
  if (card.kind === 'coins') coins[r] = Math.max(0, (coins[r] || 0) + card.v);
  else if (card.kind === 'mimic') {
    if (outcome.type === 'win') {   // бесплатно — без эффекта
      const pay = Math.min(outcome.price, coins[r] || 0);
      coins[r] -= pay;
      res.mimicPaid = pay;
    }
  } else if (card.kind === 'thief') {
    res.needThief = thiefTargets(coins, r).length > 0;
  }
  return finish(res, coins0, coins);
}

function finish(res, before, coins) {
  res.coins = coins;
  res.delta = {};
  for (const id of Object.keys(coins)) res.delta[id] = coins[id] - (before[id] || 0);
  return res;
}

/** У кого Вор может красть: другие игроки с монетами */
function thiefTargets(coins, thiefId) {
  return Object.keys(coins).filter((id) => id !== thiefId && (coins[id] || 0) > 0);
}

/** Вор крадёт min(15, монеты цели). Недопустимая цель — ничего не происходит. */
function applyThief(coins0, thiefId, targetId) {
  const coins = Object.assign({}, coins0);
  if (!thiefTargets(coins, thiefId).includes(targetId)) return { coins, stolen: 0, target: null };
  const stolen = Math.min(THIEF_STEAL, coins[targetId]);
  coins[targetId] -= stolen;
  coins[thiefId] = (coins[thiefId] || 0) + stolen;
  return { coins, stolen, target: targetId };
}

/**
 * Конец игры? → { over: false } | { over: true, reason: 'last' | 'draw' | 'rounds', winner? }
 * done — сыграно сундуков, total — всего сундуков за партию.
 */
function checkEnd(coins, done, total) {
  const alive = Object.keys(coins).filter((id) => coins[id] > 0);
  if (alive.length === 0) return { over: true, reason: 'draw' };
  if (alive.length === 1 && Object.keys(coins).length > 1) return { over: true, reason: 'last', winner: alive[0] };
  if (done >= total) return { over: true, reason: 'rounds' };
  return { over: false };
}

/**
 * Итоговые места: группы id по местам. Больше монет — выше; при равенстве —
 * кто больше заработал как Смотритель. Полное равенство — одно место.
 */
function finalRanking(coins, keeperEarn) {
  const ids = Object.keys(coins).sort((a, b) => (coins[b] - coins[a]) || ((keeperEarn[b] || 0) - (keeperEarn[a] || 0)));
  const groups = [];
  for (const id of ids) {
    const last = groups[groups.length - 1];
    const same = last && coins[last[0]] === coins[id] && (keeperEarn[last[0]] || 0) === (keeperEarn[id] || 0);
    if (same) last.push(id); else groups.push([id]);
  }
  return groups;
}

module.exports = {
  START_COINS, THIEF_STEAL, DECK_SPEC, cardKey, makeDeck, deckComposition, eligibleBidders, clampBid,
  resolveBids, applyRound, thiefTargets, applyThief, checkEnd, finalRanking
};
