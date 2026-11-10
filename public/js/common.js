/* Общие утилиты для ТВ и телефона */
(function () {
  'use strict';
  var t = function (k, v) { return window.i18n.t(k, v); };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function initial(name) {
    var n = String(name || '?').replace(/^\s*🤖\s*/, '').trim();
    return esc((Array.from(n)[0] || '?').toUpperCase());
  }

  // Нарисованные аватары приходят отдельным событием 'avatars' и кэшируются здесь
  var AVATARS = {};
  function setAvatars(map) {
    Object.keys(map || {}).forEach(function (id) { if (map[id]) AVATARS[id] = map[id]; else delete AVATARS[id]; });
  }
  function avatar(p, cls) {
    var img = p.id && AVATARS[p.id];
    return '<div class="avatar ' + (cls || '') + (img ? ' img' : '') + (p.connected === false ? ' offline' : '') + '" style="--c:' + p.color +
      (img ? ';background-image:url(' + img + ')' : '') + '">' + (img ? '' : initial(p.name)) + '</div>';
  }

  /* ---------- Таймер: сервер шлёт остаток, клиент плавно досчитывает ---------- */
  var tm = { remaining: 0, total: 0, speed: 1, paused: false, at: 0 };
  function onTimer(d) { tm.remaining = d.remaining; tm.total = d.total; tm.speed = d.speed; tm.paused = d.paused; tm.at = performance.now(); }
  function timeLeft() {
    if (tm.paused) return tm.remaining;
    return Math.max(0, tm.remaining - (performance.now() - tm.at) * tm.speed);
  }
  function fmt(ms) {
    var s = Math.ceil(ms / 1000);
    var m = Math.floor(s / 60);
    return m > 0 ? m + ':' + String(s % 60).padStart(2, '0') : String(s);
  }
  (function loop() {
    var left = timeLeft();
    var els = document.querySelectorAll('.js-timer');
    for (var i = 0; i < els.length; i++) {
      var e = els[i];
      if (!tm.total) { e.textContent = ''; e.classList.remove('danger', 'fast', 'paused'); continue; }
      e.textContent = (tm.speed > 1 && !tm.paused ? '⏩ ' : '') + fmt(left);
      e.classList.toggle('danger', left <= 10000);
      e.classList.toggle('fast', tm.speed > 1);
      e.classList.toggle('paused', tm.paused);
    }
    var bars = document.querySelectorAll('.js-timer-bar');
    for (var j = 0; j < bars.length; j++) {
      bars[j].style.width = tm.total ? (100 * left / tm.total).toFixed(2) + '%' : '0%';
      bars[j].classList.toggle('danger', left <= 10000);
    }
    requestAnimationFrame(loop);
  })();

  /* ---------- Сцены ---------- */
  var scenes = null;
  function loadScenes() {
    return fetch('/scenes.json').then(function (r) { return r.json(); }).then(function (j) { scenes = j.scenes; return scenes; });
  }
  function scene(id) { return scenes && scenes.find(function (s) { return s.id === id; }); }
  function itemNum(sceneId, itemId) {
    var s = scene(sceneId), it = s && s.items.find(function (i) { return i.id === itemId; });
    return it ? it.num : '?';
  }

  function playerById(state, id) { return state.players.find(function (p) { return p.id === id; }); }
  function nameOf(state, id) { var p = playerById(state, id); return p ? p.name : '?'; }

  window.U = {
    t: t, esc: esc, avatar: avatar, onTimer: onTimer, timeLeft: timeLeft, fmt: fmt,
    timerTotal: function () { return tm.total; }, loadScenes: loadScenes, setAvatars: setAvatars, AVATARS: AVATARS, scene: scene, itemNum: itemNum, playerById: playerById, nameOf: nameOf
  };
})();
