'use strict';
/*
 * Платформа party-игр: «Чужой», «Снайпер», «Крокодил».
 * Express раздаёт статику, socket.io и lib/platform.js ведут состояние,
 * игры — модули в games/.
 */
const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { attach } = require('./lib/platform');
const os = require('os');
const { exec } = require('child_process');
const { lanIP } = require('./lib/util');
const pkg = require('./package.json');

const PORT = Number(process.env.PORT) || 3000;
// Для отладки: TIME_SCALE=0.2 ускорит таймеры фаз в 5 раз; MIN_PLAYERS — минимум игроков для всех игр
const TIME_SCALE = Number(process.env.TIME_SCALE) || 1;
const MIN_OVERRIDE = Number(process.env.MIN_PLAYERS) || 0;

const app = express();
const server = http.createServer(app);
// Телефоны (особенно iPhone/iPad) притормаживают вкладку в фоне — даём связи запас по времени
const io = new Server(server, { pingInterval: 20000, pingTimeout: 45000 });

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.redirect('/tv'));
app.get('/tv', (req, res) => res.sendFile(path.join(__dirname, 'public', 'tv.html')));
app.get('/play', (req, res) => res.sendFile(path.join(__dirname, 'public', 'play.html')));
app.get('/scenes.json', (req, res) => res.sendFile(path.join(__dirname, 'data', 'scenes.json')));
app.get('/check', (req, res) => res.sendFile(path.join(__dirname, 'public', 'check.html')));
app.get('/api/qr', (req, res) => {
  const text = String(req.query.text || '').slice(0, 300);
  require('qrcode').toBuffer(text, { margin: 1, width: 360 }, (e, buf) => { if (e) return res.status(400).end(); res.type('png').send(buf); });
});

// Диагностика: адреса компьютера в сети — помогает понять, почему телефон не подключается
app.get('/api/info', (req, res) => {
  const ifaces = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const n of list || []) if ((n.family === 'IPv4' || n.family === 4) && !n.internal) ifaces.push({ name, address: n.address });
  }
  res.json({
    version: pkg.version, port: PORT, lanIP: lanIP(), ifaces,
    playUrl: `http://${lanIP()}:${PORT}/play`, tvUrl: `http://${lanIP()}:${PORT}/tv`,
    node: process.version, platform: process.platform, time: Date.now(),
    yourIP: (req.socket.remoteAddress || '').replace('::ffff:', '')
  });
});

const platform = attach(io, { port: PORT, timeScale: TIME_SCALE, minOverride: MIN_OVERRIDE });

server.listen(PORT, '0.0.0.0', () => {
  const ip = lanIP();
  console.log('\n  🎉  Набор party-игр запущен!\n');
  console.log(`  Экран ТВ (откройте на телевизоре/ноутбуке):  http://${ip}:${PORT}/tv`);
  console.log(`  Локально на этом компьютере:                 http://localhost:${PORT}/tv`);
  console.log(`  Тест с ботами:                               http://localhost:${PORT}/tv?bots=5`);
  console.log('  Телефоны подключаются по QR-коду с экрана ТВ (та же Wi-Fi сеть).');
  console.log(`  Проблемы с подключением? Откройте http://${ip}:${PORT}/check\n`);
  // При запуске двойным кликом (лаунчер / exe) сразу открываем экран ТВ в браузере
  if ((process.env.OPEN_BROWSER || process.argv.includes('--open') || process.pkg) && !process.argv.includes('--no-open')) {
    const url = `http://localhost:${PORT}/tv`;
    const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
    exec(cmd, () => {});
  }
});
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n  Порт ${PORT} уже занят — возможно, игра уже запущена в другом окне.`);
    console.error(`  Откройте http://localhost:${PORT}/tv или закройте другое окно.\n`);
  } else console.error(e);
  if (process.pkg || process.env.OPEN_BROWSER) setTimeout(() => process.exit(1), 15000); else process.exit(1);
});

module.exports = { server, platform };
