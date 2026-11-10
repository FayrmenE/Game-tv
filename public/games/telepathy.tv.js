/* «Телепатия» — экран ТВ */
(function () {
  'use strict';
  var t = U.t, esc = U.esc;
  var $ = function (id) { return document.getElementById(id); };
  var P = null, G = null, mode = null;

  function render(p) {
    P = p; G = p.game;
    var tr = G.turn || {}, ph = G.phase;
    var giver = U.nameOf(P, tr.giver);
    $('phaseTitle').textContent = t('tele.turn', { n: G.turnNo, total: G.total }) + ' · ' + t('tele.phase.' + ph);
    $('phaseSub').textContent = t('tele.team', { n: G.team, max: G.maxTeam }) + (U.scene(tr.sceneId) ? ' · ' + t(U.scene(tr.sceneId).nameKey) : '');
    var key = G.turnNo + ':' + tr.sceneId + ':' + i18n.getLang();
    if (key !== mode && U.scene(tr.sceneId)) {
      mode = key;
      $('main').innerHTML = '<div class="tp-wrap"><div class="tp-clue" id="tpClue"></div>' +
        '<div class="scene-wrap tp-scene"><div class="scene-frame" id="tpFrame">' + ART.sceneSvg(U.scene(tr.sceneId)) + '</div></div></div>';
    }
    var clue = $('tpClue');
    if (!clue) return;
    if (ph === 'clue') clue.innerHTML = '<span class="tp-think">🔮 ' + esc(t('tele.clueTv', { name: giver })) + '</span>';
    else clue.innerHTML = tr.clue ? '<small>' + esc(t('tele.guessTv')) + '</small><b>' + esc(tr.clue) + '</b>' : '<span class="tp-think">🤷 ' + esc(t('tele.noClue')) + '</span>';
    if (ph === 'reveal') clue.innerHTML += '<em class="' + (tr.trapHit ? 'bad' : tr.pts ? '' : 'zero') + '">' +
      esc(tr.trapHit ? t('tele.resTrap') : t('tele.resHits', { n: tr.hits }) + ' · ' + t('tele.resPts', { n: tr.pts })) + '</em>';
    // подсветка: выбор команды, после раскрытия — загаданное и ловушка
    var frame = $('tpFrame');
    frame.querySelectorAll('.scene-item').forEach(function (g) { g.classList.remove('hl', 'hl-alien', 'tp-sel'); });
    (tr.sel || []).forEach(function (s) { var g = document.getElementById('item-' + s.item); if (g) g.classList.add('tp-sel'); });
    if (ph === 'reveal') {
      (tr.targets || []).forEach(function (id) { var g = document.getElementById('item-' + id); if (g) g.classList.add('hl'); });
      var tg = document.getElementById('item-' + tr.trap); if (tg) tg.classList.add('hl-alien');
    }
    frame.classList.toggle('dim', ph === 'reveal');
    // полоса игроков: связной + кто что выбрал
    $('strip').innerHTML = G.participants.map(function (id) {
      var pl = U.playerById(P, id) || { name: '?', color: '#888' };
      var picks = (tr.sel || []).filter(function (s) { return s.by === id; }).length;
      return '<div class="pcol' + (id === tr.giver ? ' turn' : '') + '">' + (picks ? '<div class="check">' + picks + '</div>' : '') + U.avatar(pl) +
        '<div class="pname">' + (id === tr.giver ? '🔮 ' : '') + esc(pl.name) + '</div><div class="score">★ ' + (G.scores[id] || 0) + '</div></div>';
    }).join('');
  }

  function unmount() { mode = null; P = G = null; }
  window.GAMES = window.GAMES || {};
  (window.GAMES.telepathy = window.GAMES.telepathy || {}).tv = { render: render, unmount: unmount };
})();
