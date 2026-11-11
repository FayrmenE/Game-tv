/*
 * Холст «Крокодила»: общий для ТВ (просмотр) и телефона (рисование).
 * Координаты нормированы 0…1000, рисунок квадратный.
 * Операции: s (начало штриха), a (точки), end, u (отменить), x (очистить).
 */
(function () {
  'use strict';
  var COLORS = ['#22223b', '#e63946', '#1982c4', '#2d9d4f', '#ffbe0b', '#8d5a3b', '#ffffff'];
  var WIDTHS = [8, 22];
  var MINI = [300, 700];

  /* ------------------------------ Board: хранит и рисует штрихи ------------------------------ */
  function Board(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.strokes = [];
    this.hidden = false;
    this.size = 0;
    var self = this;
    if (window.ResizeObserver) {
      this.ro = new ResizeObserver(function () { self.resize(); });
      this.ro.observe(canvas);
    }
    this.resize();
  }
  Board.prototype.resize = function () {
    var r = this.canvas.getBoundingClientRect();
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var s = Math.max(10, Math.round(Math.min(r.width, r.height || r.width) * dpr));
    if (s === this.size) return;
    this.size = s;
    this.canvas.width = s;
    this.canvas.height = s;
    this.redraw();
  };
  Board.prototype.k = function () { return this.size / 1000; };
  Board.prototype.style = function (st) {
    var c = this.ctx, k = this.k();
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = c.fillStyle = st.e ? '#ffffff' : (COLORS[st.c] || COLORS[0]);
    c.lineWidth = (st.e ? WIDTHS[1] * 1.6 : WIDTHS[st.w ? 1 : 0]) * k;
  };
  Board.prototype.drawStroke = function (st, from) {
    var c = this.ctx, k = this.k(), p = st.p;
    if (!p || p.length < 2) return;
    this.style(st);
    if (p.length === 2 && !from) {
      c.beginPath(); c.arc(p[0] * k, p[1] * k, c.lineWidth / 2, 0, Math.PI * 2); c.fill();
      return;
    }
    var i0 = Math.max(0, (from || 0) - 2);
    c.beginPath();
    c.moveTo(p[i0] * k, p[i0 + 1] * k);
    for (var i = i0 + 2; i + 1 < p.length; i += 2) c.lineTo(p[i] * k, p[i + 1] * k);
    c.stroke();
  };
  Board.prototype.redraw = function () {
    var c = this.ctx;
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, this.size, this.size);
    if (this.hidden) return;
    for (var i = 0; i < this.strokes.length; i++) this.drawStroke(this.strokes[i], 0);
  };
  Board.prototype.reset = function (strokes) {
    this.strokes = (strokes || []).map(function (s) { return { id: s.id, c: s.c, w: s.w, e: s.e, p: s.p.slice() }; });
    this.redraw();
  };
  Board.prototype.apply = function (ops) {
    var redraw = false;
    for (var i = 0; i < ops.length; i++) {
      var op = ops[i];
      if (op.o === 's') {
        var st = { id: op.id, c: op.c, w: op.w, e: op.e, p: (op.p || []).slice() };
        this.strokes.push(st);
        if (!this.hidden) this.drawStroke(st, 0);
      } else if (op.o === 'a') {
        var s = this.strokes[this.strokes.length - 1];
        if (!s || s.id !== op.id) continue;
        var from = s.p.length;
        Array.prototype.push.apply(s.p, op.p || []);
        if (!this.hidden) this.drawStroke(s, from);
      } else if (op.o === 'u') { this.strokes.pop(); redraw = true; }
      else if (op.o === 'x') { this.strokes = []; redraw = true; }
    }
    if (redraw) this.redraw();
  };
  Board.prototype.setHidden = function (h) { if (this.hidden !== !!h) { this.hidden = !!h; this.redraw(); } };
  Board.prototype.destroy = function () { if (this.ro) this.ro.disconnect(); };

  /* ------------------------------ Pad: рисование пальцем ------------------------------ */
  /**
   * opts: { send(ops), tool(): {c, w, e}, mini: bool, oneline: bool, onLine(): void (линия закончена) }
   * Батчи отправляются каждые ~50 мс.
   */
  function Pad(canvas, opts) {
    var self = this;
    this.board = new Board(canvas);
    this.opts = opts;
    this.queue = [];
    this.cur = null;
    this.disabled = false;
    this.lines = 0;
    this.timer = setInterval(function () { self.flush(); }, 50);

    function pos(e) {
      var r = canvas.getBoundingClientRect();
      var x = Math.round((e.clientX - r.left) / r.width * 1000), y = Math.round((e.clientY - r.top) / r.height * 1000);
      x = Math.max(0, Math.min(1000, x)); y = Math.max(0, Math.min(1000, y));
      if (self.opts.mini) { x = Math.max(MINI[0], Math.min(MINI[1], x)); y = Math.max(MINI[0], Math.min(MINI[1], y)); }
      return [x, y];
    }
    canvas.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      if (self.disabled || self.cur) return;
      if (self.opts.oneline && self.lines > 0) return;
      try { canvas.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
      var t = self.opts.tool();
      var p = pos(e);
      self.cur = { id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), last: p, pid: e.pointerId };
      var op = { o: 's', id: self.cur.id, c: t.c, w: t.w, e: !!t.e, p: p };
      self.board.apply([op]);
      self.queue.push(op);
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!self.cur || e.pointerId !== self.cur.pid) return;
      e.preventDefault();
      var evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      var pts = [];
      for (var i = 0; i < evs.length; i++) {
        var p = pos(evs[i]);
        if (Math.abs(p[0] - self.cur.last[0]) + Math.abs(p[1] - self.cur.last[1]) < 4) continue;
        self.cur.last = p;
        pts.push(p[0], p[1]);
      }
      if (!pts.length) return;
      var op = { o: 'a', id: self.cur.id, p: pts };
      self.board.apply([op]);
      self.queue.push(op);
    });
    var end = function (e) {
      if (!self.cur || (e && e.pointerId !== self.cur.pid)) return;
      self.queue.push({ o: 'end', id: self.cur.id });
      self.cur = null;
      self.lines++;
      self.flush();
      if (self.opts.oneline && self.opts.onLine) self.opts.onLine();
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('lostpointercapture', end);
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }
  Pad.prototype.flush = function () {
    if (!this.queue.length) return;
    // Склеиваем подряд идущие точки одного штриха
    var out = [];
    for (var i = 0; i < this.queue.length; i++) {
      var op = this.queue[i], last = out[out.length - 1];
      if (op.o === 'a' && last && last.o === 'a' && last.id === op.id) last.p = last.p.concat(op.p);
      else out.push(op.o === 'a' ? { o: 'a', id: op.id, p: op.p.slice() } : op);
    }
    this.queue = [];
    this.opts.send(out);
  };
  Pad.prototype.undo = function () { this.board.apply([{ o: 'u' }]); this.queue.push({ o: 'u' }); this.flush(); };
  Pad.prototype.clear = function () { this.board.apply([{ o: 'x' }]); this.queue.push({ o: 'x' }); this.flush(); };
  Pad.prototype.destroy = function () { this.flush(); clearInterval(this.timer); this.board.destroy(); };

  window.CANVAS = { COLORS: COLORS, WIDTHS: WIDTHS, MINI: MINI, Board: Board, Pad: Pad };
})();
