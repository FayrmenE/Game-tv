'use strict';
/* Реестр игр. Каждая запись — пункт меню на ТВ. */
const alien = require('./alien');
const sniper = require('./sniper');
const croc = require('./crocodile');
const battleship = require('./battleship');
const doodle = require('./doodle');
const chests = require('./chests');

module.exports = {
  alien: { id: 'alien', min: 3, max: 10, create: alien.create },
  sniper: { id: 'sniper', min: 2, max: 10, create: sniper.create },
  croc_solo: { id: 'croc_solo', min: 3, max: 10, create: croc.create, opts: { mode: 'solo' } },
  croc_duel: { id: 'croc_duel', min: 4, max: 12, create: croc.create, opts: { mode: 'duel' } },
  // играют двое, остальные в комнате — зрители
  doodle: { id: 'doodle', min: 3, max: 8, create: doodle.create },
  chests: { id: 'chests', min: 3, max: 12, create: chests.create },
  battleship: { id: 'battleship', min: 2, max: 12, label: '2', create: battleship.create }
};
