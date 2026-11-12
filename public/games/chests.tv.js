/* «Сундуки» — экран ТВ */
(function () {
  'use strict';
  var t = U.t, esc = U.esc;
  var $ = function (id) { return document.getElementById(id); };
  var P = null, G = null, layout = null, revealKey = null, timers = [];
  function pl(id) { return U.playerById(P, id) || { name: '?', color: '#888' }; }
  function clear() { timers.forEach(clearTimeout); timers = []; }

  var cardEmoji = CHESTS.cardEmoji, cardLabel = CHESTS.cardLabel, cardTone = CHESTS.cardTone, chestSvg = CHESTS.chestSvg;

  function render(p) {
    P = p; G = p.game;
    var ph = G.phase;
    $('phaseTitle').textContent = t('chests.ph.' + ph, { name: pl(G.keeper).name });
    $('phaseSub').textContent = t('chests.counter', { c: Math.min(G.circle, G.rounds), r: G.rounds, i: G.idx + 1 > G.total ? G.total : G.idx + 1, n: G.total }) +
      (G.hard ? ' · ' + t('chests.hardOn') : '');
    var want = 'ch' + i18n.getLang();
    if (layout !== want) {
      layout = want; clear(); revealKey = null;
      $('main').innerHTML = '<div class="ch-tv"><div class="ch-table" id="chTable"></div>' +
        '<div class="ch-center"><div class="ch-stage" id="chStage"></div><div class="ch-bids" id="chBids"></div><div class="ch-msg" id="chMsg"></div></div>' +
        '<div class="ch-out" id="chOut"></div></div>';
      $('strip').innerHTML = '';
      $('strip').classList.add('hidden');
    }
    table();
    outPanel();
    if (ph === 'final') return finalView();
    if (ph === 'reveal' || ph === 'thief' || ph === 'stolen') return revealView();
    revealKey = null; clear();
    $('chBids').innerHTML = '';
    var keeperName = esc(pl(G.keeper).name);
    var stage = '<div class="ch-chest' + (ph === 'inspect' ? ' peek' : ph === 'bid' ? ' shake' : '') + '">' + chestSvg() + '</div>' +
      '<div class="ch-keeper">' + U.avatar(pl(G.keeper)) + '<span>🗝️ ' + keeperName + '</span></div>';
    if (ph === 'discuss' || ph === 'bid') stage += '<div class="ch-timer js-timer"></div>';
    setStage(ph + G.idx, stage);
    var m = ph === 'inspect' ? t('chests.tv.inspect', { name: pl(G.keeper).name }) :
      ph === 'discuss' ? t('chests.tv.discuss', { name: pl(G.keeper).name }) :
      t('chests.tv.bid', { n: G.touched.length, m: (G.bidders || []).length });
    $('chMsg').textContent = m;
  }

  function setStage(k, html) { var s = $('chStage'); if (s.dataset.k === k) return; s.dataset.k = k; s.innerHTML = html; }

  function table() {
    var rows = G.order.slice().sort(function (a, b) { return (G.coins[b] || 0) - (G.coins[a] || 0); });
    var showDelta = G.delta && (G.phase === 'stolen' || G.phase === 'thief' || (G.phase === 'reveal' && revealKey && $('chStage').dataset.open));
    $('chTable').innerHTML = '<h3>💰 ' + esc(t('chests.tv.coins')) + '</h3>' + rows.map(function (id) {
      var c = G.coins[id] || 0, d = showDelta ? G.delta[id] || 0 : 0;
      var isK = id === G.keeper && G.phase !== 'final';
      var cls = 'ch-row' + (isK ? ' keeper' : '') + (c <= 0 ? ' broke' : '') + (G.touched.indexOf(id) >= 0 ? ' done' : '');
      return '<div class="' + cls + '">' + U.avatar(pl(id)) + '<b>' + esc(pl(id).name) + '</b>' +
        (isK ? '<span class="ch-tag">🗝️</span>' : c <= 0 ? '<span class="ch-tag">💀</span>' : G.touched.indexOf(id) >= 0 ? '<span class="ch-tag">✓</span>' : '') +
        (d ? '<em class="' + (d > 0 ? 'up' : 'down') + '">' + (d > 0 ? '+' : '−') + Math.abs(d) + '</em>' : '') +
        '<span class="ch-c">' + c + '</span></div>';
    }).join('');
  }

  function outPanel() {
    var used = {};
    G.out.forEach(function (k) { used[k] = (used[k] || 0) + 1; });
    $('chOut').innerHTML = '<h3>📦 ' + esc(t('chests.tv.out')) + '</h3>' +
      '<div class="ch-hist">' + (G.out.length ? G.out.map(function (k) { return '<span class="ch-mini ' + cardTone(k) + '">' + cardEmoji(k) + (cardTone(k) === 'good' || cardTone(k) === 'bad' ? '<small>' + esc(cardLabel(k)) + '</small>' : '') + '</span>'; }).join('') : '<i>—</i>') + '</div>' +
      '<h4>' + esc(t('chests.tv.deck')) + '</h4><div class="ch-deck">' + G.deck.map(function (d) {
        var u = used[d.key] || 0;
        return '<div class="ch-dk ' + cardTone(d.key) + (u >= d.total ? ' gone' : '') + '"><span>' + cardEmoji(d.key) + ' ' + esc(cardLabel(d.key)) + '</span><b>' + (d.total - u) + '/' + d.total + '</b></div>';
      }).join('') + '</div>';
  }

  function outcomeText() {
    var o = G.outcome;
    if (o.type === 'tie') return t('chests.out.tie', { n: o.price });
    if (o.type === 'free') return t('chests.out.free', { name: pl(G.keeper).name });
    return t('chests.out.win', { name: pl(o.winner).name, n: o.price }) + (G.burned ? ' ' + t('chests.out.burned', { n: G.burned, k: G.keeperGot }) : '');
  }
  function effectText() {
    var k = G.card, r = G.recipient;
    if (G.outcome.type === 'tie') return t('chests.eff.burn');
    if (k === 'mimic') return G.mimicPaid ? t('chests.eff.mimic', { name: pl(r).name, n: G.mimicPaid }) : t('chests.eff.mimicFree');
    if (k === 'thief') {
      if (G.thief && G.thief.target) return t('chests.eff.stole', { name: pl(G.thief.id).name, n: G.thief.stolen, who: pl(G.thief.target).name });
      if (G.phase === 'thief' || (G.phase === 'reveal' && G.needThief)) return t('chests.eff.thiefPick', { name: pl(r).name });
      return t('chests.eff.thiefNone');
    }
    if (k === '0') return t('chests.eff.empty', { name: pl(r).name });
    return t(k.charAt(0) === '+' ? 'chests.eff.plus' : 'chests.eff.minus', { name: pl(r).name, n: k.replace(/[+-]/, '') });
  }

  function revealView() {
    var k = 'rv' + G.idx;
    var bidders = Object.keys(G.bids || {});
    if (revealKey !== k) {
      revealKey = k; clear();
      var total = U.timerTotal() || 7000, sc = total / 7000;
      var stage = $('chStage'); stage.dataset.k = k; delete stage.dataset.open;
      stage.innerHTML = '<div class="ch-chest" id="chChest">' + chestSvg() + '<div class="ch-content ' + cardTone(G.card) + '"><span>' + cardEmoji(G.card) + '</span><b>' + esc(cardLabel(G.card)) + '</b></div></div>' +
        '<div class="ch-keeper">' + U.avatar(pl(G.keeper)) + '<span>🗝️ ' + esc(pl(G.keeper).name) + '</span></div>';
      var top = G.outcome.type === 'win' ? [G.outcome.winner] : G.outcome.ids || [];
      $('chBids').innerHTML = bidders.length ? bidders.map(function (id) {
        var v = G.bids[id];
        return '<div class="vcard ch-bid' + (top.indexOf(id) >= 0 ? ' top' : '') + '"><div class="back">🪙</div><div class="front">' + U.avatar(pl(id)) +
          '<div class="ch-bn">' + (v ? v : esc(t('chests.pass'))) + '</div><small>' + esc(pl(id).name) + '</small></div></div>';
      }).join('') : '<div class="ch-nobid">' + esc(t('chests.tv.nobody')) + '</div>';
      $('chMsg').textContent = t('chests.tv.bidsOpen');
      timers.push(setTimeout(function () {
        document.querySelectorAll('.ch-bid').forEach(function (e) { e.classList.add('flip'); });
        SFX.play('whoosh');
        $('chMsg').textContent = outcomeText();
      }, 500 * sc + 200));
      timers.push(setTimeout(function () {
        var c = $('chChest'); if (!c) return;
        c.classList.add('open', G.outcome.type === 'tie' ? 'burn' : cardTone(G.card));
        stage.dataset.open = '1';
        $('chMsg').innerHTML = esc(outcomeText()) + '<br><b>' + esc(effectText()) + '</b>';
        table();
        if (G.outcome.type !== 'tie' && cardTone(G.card) === 'good' && window.SHELL && SHELL.confetti) SHELL.confetti();
      }, 3000 * sc + 200));
      return;
    }
    if (stageOpen()) $('chMsg').innerHTML = esc(outcomeText()) + '<br><b>' + esc(effectText()) + '</b>';
  }
  function stageOpen() { return !!$('chStage').dataset.open; }

  function finalView() {
    clear();
    var e = G.end, s = G.stats || {};
    var head = e.reason === 'draw' ? t('chests.end.draw') : e.reason === 'last' ? t('chests.end.last', { name: pl(e.winner).name }) : t('chests.end.rounds');
    var st = function (emoji, label, id, val) {
      return id ? '<div class="ch-stat"><span>' + emoji + '</span><div><small>' + esc(label) + '</small><b>' + esc(pl(id).name) + '</b><i>' + esc(val) + '</i></div></div>' : '';
    };
    setStage('final', '<div class="ch-final"><h2>🏁 ' + esc(head) + '</h2><div class="ch-stats">' +
      st('🗝️', t('chests.stat.keeper'), s.keeper && s.keeper.id, s.keeper ? t('chests.coinsN', { n: s.keeper.n }) : '') +
      st('💥', t('chests.stat.worst'), s.worst && s.worst.id, s.worst ? '−' + s.worst.loss + ' · ' + cardEmoji(s.worst.key) + ' ' + cardLabel(s.worst.key) : '') +
      st('🙅', t('chests.stat.passer'), s.passer && s.passer.id, s.passer ? t('chests.passesN', { n: s.passer.n }) : '') +
      '</div></div>');
    $('chBids').innerHTML = '';
    $('chMsg').textContent = '';
  }

  function unmount() { clear(); layout = null; revealKey = null; P = G = null; var s = $('strip'); if (s) s.classList.remove('hidden'); }
  window.GAMES = window.GAMES || {};
  (window.GAMES.chests = window.GAMES.chests || {}).tv = { render: render, unmount: unmount };
})();
