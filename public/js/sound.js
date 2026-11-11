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
    drum: function () { for (var i = 0; i < 18; i++) noise(i * 0.06, 0.07, 0.25 + i * 0.02, 300); tone(90, 1.1, 0.5, 'sine', 0.4, 50); },
    boom: function () { noise(0, 0.5, 0.9, 80); tone(70, 0, 0.5, 'sine', 0.5, 35); },
    sink: function () { noise(0, 0.8, 0.9, 60); tone(110, 0.05, 0.9, 'sawtooth', 0.25, 30); tone(660, 0.5, 0.25, 'triangle', 0.2); },
    splash: function () { noise(0, 0.35, 0.35, 1500); },
    click: function () { tone(880, 0, 0.035, 'triangle', 0.07); },
    pop: function () { tone(500, 0, 0.09, 'sine', 0.2, 1100); },
    whoosh: function () { noise(0, 0.35, 0.25, 2500); tone(300, 0, 0.3, 'sine', 0.06, 900); },
    join: function () { tone(523, 0, 0.1, 'triangle', 0.2); tone(784, 0.08, 0.18, 'triangle', 0.2); },
    vote: function () { tone(660, 0, 0.06, 'square', 0.08); tone(990, 0.05, 0.08, 'square', 0.06); },
    reveal: function () { [392, 523, 659].forEach(function (f, i) { tone(f, i * 0.09, 0.22, 'triangle', 0.18); }); },
    win: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, i * 0.12, 0.3, 'triangle', 0.25); }); }
  };

  window.SFX = {
    play: function (k) { try { if (SOUNDS[k]) SOUNDS[k](); } catch (e) { /* ignore */ } },
    ready: function () { var c = ac(); return !!c && c.state === 'running'; },
    unlock: ac
  };
})();
