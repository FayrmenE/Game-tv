/* «Снайпер» — экран телефона: одна огромная кнопка */
(function () {
  'use strict';
  var t = U.t, esc = U.esc;
  var P = null, G = null, el = null, ctx = null, key = null;
  var lockUntil = 0, flash = null, flashTimer = null;

  function render(p, root, c) {
    P = p; G = p.game; ctx = c;
    if (el !== root) { el = root; key = null; }
    var k = [G.phase, G.n, G.hit, G.score, G.spectator, i18n.getLang(), flash && flash.kind].join('|');
    if (k === key) return;
    key = k;
    if (G.spectator) { el.innerHTML = '<div class="card big-msg"><div class="emoji">🎯</div><h2>' + esc(t('play.spectator')) + '</h2></div>'; return; }
    var head = '';
    if (G.target) head = '<div class="sn-phead">' + esc(t('sniper.catch')) + ' ' + ART.itemSvg(G.target, 'sn-ico') + '<b>' + esc(t('item.' + G.target)) + '</b>' +
      '<span class="sn-pscore">' + esc(t('sniper.score')) + ': ' + G.score + '</span></div>';
    var label = t('sniper.fire'), cls = '';
    var sub = G.phase === 'stream' ? t('sniper.waitTv') : G.phase === 'calibrate' ? t('sniper.calibrateSub') : t('sniper.getReady');
    if (G.phase === 'calibrate') { label = '📡'; cls = 'idle'; }
    if (G.phase === 'intro') cls = 'idle';
    if (G.hit != null) { label = t('sniper.hit', { ms: G.hit }); cls = 'hit'; sub = t('sniper.done'); }
    if (G.phase === 'results' && G.myResult) { label = t('sniper.hit', { ms: G.myResult.ms }) + (G.myResult.pts ? ' +' + G.myResult.pts : ''); cls = 'hit'; sub = t('sniper.getReady'); }
    if (flash && flash.kind === 'wrong') { label = t('sniper.wrong'); cls = 'wrong'; sub = t('sniper.locked'); }
    el.innerHTML = '<div class="fill-screen">' + head + '<button class="sn-fire ' + cls + '" id="fire">' + esc(label) + '<small>' + esc(sub) + '</small></button></div>';
    var b = document.getElementById('fire');
    b.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      if (Date.now() < lockUntil) return;
      ctx.act('shoot');
      SFX.play('shot');
      try { navigator.vibrate && navigator.vibrate(30); } catch (x) { /* ignore */ }
    });
    b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  function onEvent(ev, d) {
    if (ev !== 'you') return;
    if (d.kind === 'wrong' || d.kind === 'locked') {
      lockUntil = Date.now() + (d.left || 1000);
      flash = { kind: 'wrong' };
      SFX.play('err');
      clearTimeout(flashTimer);
      flashTimer = setTimeout(function () { flash = null; key = null; if (P) render(P, el, ctx); }, d.left || 1000);
    } else if (d.kind === 'hit') SFX.play('ok');
    key = null;
    if (P) render(P, el, ctx);
  }

  function unmount() { key = null; P = G = null; el = null; flash = null; clearTimeout(flashTimer); }

  window.GAMES = window.GAMES || {};
  (window.GAMES.sniper = window.GAMES.sniper || {}).play = { render: render, unmount: unmount, onEvent: onEvent,
    hideReactions: function (p) { return p.game && p.game.phase !== 'results'; } };
})();
