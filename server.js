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
const { lanIP } = require('./lib/util');

const PORT = Number(process.env.PORT) || 3000;
// Для отладки: TIME_SCALE=0.2 ускорит таймеры фаз в 5 раз; MIN_PLAYERS — минимум игроков для всех игр
const TIME_SCALE = Number(process.env.TIME_SCALE) || 1;
const MIN_OVERRIDE = Number(process.env.MIN_PLAYERS) || 0;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.redirect('/tv'));
app.get('/tv', (req, res) => res.sendFile(path.join(__dirname, 'public', 'tv.html')));
app.get('/play', (req, res) => res.sendFile(path.join(__dirname, 'public', 'play.html')));
app.get('/scenes.json', (req, res) => res.sendFile(path.join(__dirname, 'data', 'scenes.json')));

const platform = attach(io, { port: PORT, timeScale: TIME_SCALE, minOverride: MIN_OVERRIDE });

server.listen(PORT, '0.0.0.0', () => {
  const ip = lanIP();
  console.log('\n  🎉  Набор party-игр запущен!\n');
  console.log(`  Экран ТВ (откройте на телевизоре/ноутбуке):  http://${ip}:${PORT}/tv`);
  console.log(`  Локально на этом компьютере:                 http://localhost:${PORT}/tv`);
  console.log(`  Тест с ботами:                               http://localhost:${PORT}/tv?bots=5`);
  console.log('  Телефоны подключаются по QR-коду с экрана ТВ (та же Wi-Fi сеть).\n');
});

module.exports = { server, platform };
