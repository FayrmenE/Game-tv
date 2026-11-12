/* Звуки через Web Audio — без файлов. SFX.play('ok' | 'err' | 'shot' | 'tick' | 'win') */
(function () {
  'use strict';
  var ctx = null;
  function ac() {
    if (!ctx) {
      var C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  // Браузеры разрешают звук только после жеста пользователя
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
    window.addEventListener(ev, function () { ac(); }, { passive: true });
  });

  function tone(freq, start, dur, type, vol, slideTo) {
    var c = ac(); if (!c) return;
    var o = c.createOscillator(), g = c.createGain(), t0 = c.currentTime + start;
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.25, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise(start, dur, vol, hp) {
    var c = ac(); if (!c) return;
    var len = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    var src = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = hp || 800;
    src.buffer = buf; g.gain.value = vol || 0.5;
    src.connect(f); f.connect(g); g.connect(c.destination);
    src.start(c.currentTime + start);
  }

  var SOUNDS = {
    ok: function () { tone(660, 0, 0.12, 'triangle', 0.3); tone(990, 0.1, 0.22, 'triangle', 0.3); },
    err: function () { tone(220, 0, 0.25, 'sawtooth', 0.18, 110); },
    shot: function () { noise(0, 0.15, 0.6, 1200); tone(140, 0, 0.12, 'square', 0.15, 60); },
    tick: function () { tone(1200, 0, 0.04, 'square', 0.08); },
    drum: function () { for (var i = 0; i < 22; i++) noise(i * 0.05, 0.06, 0.18 + i * 0.015, 180); noise(1.1, 0.5, 0.6, 60); tone(70, 1.1, 0.6, 'sine', 0.45, 40); },
    boom: function () { noise(0, 0.5, 0.9, 80); tone(70, 0, 0.5, 'sine', 0.5, 35); },
    sink: function () { noise(0, 0.8, 0.9, 60); tone(110, 0.05, 0.9, 'sawtooth', 0.25, 30); tone(660, 0.5, 0.25, 'triangle', 0.2); },
    splash: function () { noise(0, 0.35, 0.35, 1500); },
    click: function () { tone(880, 0, 0.035, 'triangle', 0.07); },
    pop: function () { tone(500, 0, 0.09, 'sine', 0.2, 1100); },
    whoosh: function () { noise(0, 0.35, 0.25, 2500); tone(300, 0, 0.3, 'sine', 0.06, 900); },
    join: function () { tone(523, 0, 0.1, 'triangle', 0.2); tone(784, 0.08, 0.18, 'triangle', 0.2); },
    vote: function () { tone(660, 0, 0.06, 'square', 0.08); tone(990, 0.05, 0.08, 'square', 0.06); },
    reveal: function () { [392, 523, 659].forEach(function (f, i) { tone(f, i * 0.09, 0.22, 'triangle', 0.18); }); },
    lose: function () { [392, 330, 262].forEach(function (f, i) { tone(f, i * 0.15, 0.3, 'sine', 0.2); }); },
    win: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, i * 0.12, 0.3, 'triangle', 0.25); }); }
  };

  /* ---- Настоящие звуки (Kenney, CC0) из /sfx/*.mp3; синтезатор выше — запасной вариант ---- */
  var FILES = ['ok', 'err', 'click', 'tick', 'pop', 'whoosh', 'join', 'vote', 'shot', 'boom', 'sink', 'splash', 'win', 'lose', 'reveal'];
  var VOL = { click: 0.5, tick: 0.6, vote: 0.7, pop: 0.8, whoosh: 0.6, shot: 0.9, win: 0.8, lose: 0.8, reveal: 0.8 };
  var buffers = {}, loading = false;
  function loadAll() {
    var c = ac(); if (!c || loading) return;
    loading = true;
    FILES.forEach(function (k) {
      fetch('/sfx/' + k + '.mp3').then(function (r) { return r.arrayBuffer(); }).then(function (b) {
        // старые Safari понимают только колбэк-форму decodeAudioData
        c.decodeAudioData(b, function (buf) { buffers[k] = buf; }, function () { /* останется синтезатор */ });
      }).catch(function () { /* нет файла — синтезатор */ });
    });
  }
  function playBuffer(k) {
    var c = ac(), buf = buffers[k];
    if (!c || !buf) return false;
    var src = c.createBufferSource(), g = c.createGain();
    src.buffer = buf; g.gain.value = VOL[k] != null ? VOL[k] : 1;
    src.connect(g); g.connect(c.destination); src.start();
    return true;
  }
  // Слои поверх файлов: тёплый низкий гул взрыва, мягкий шум воды
  var LAYER = {
    boom: function () { noise(0, 0.9, 0.55, 40); tone(60, 0, 0.7, 'sine', 0.5, 28); },
    sink: function () { noise(0, 1.2, 0.4, 50); },
    splash: function () { noise(0, 0.5, 0.35, 900); noise(0.08, 0.6, 0.2, 2500); }
  };
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) { window.addEventListener(ev, loadAll, { passive: true, once: true }); });
  setTimeout(loadAll, 50);

  window.SFX = {
    play: function (k) {
      try {
        var ok = playBuffer(k);
        if (LAYER[k]) LAYER[k]();
        else if (!ok && SOUNDS[k]) SOUNDS[k]();
      } catch (e) { /* ignore */ }
    },
    ready: function () { var c = ac(); return !!c && c.state === 'running'; },
    loaded: function () { return Object.keys(buffers); },
    unlock: ac
  };
})();
