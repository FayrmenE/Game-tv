'use strict';
/* Реестр игр. Каждая запись — пункт меню на ТВ. */
const alien = require('./alien');
const sniper = require('./sniper');
const croc = require('./crocodile');
const telepathy = require('./telepathy');

module.exports = {
  alien: { id: 'alien', min: 3, max: 10, create: alien.create },
  sniper: { id: 'sniper', min: 2, max: 10, create: sniper.create },
  croc_solo: { id: 'croc_solo', min: 3, max: 10, create: croc.create, opts: { mode: 'solo' } },
  croc_duel: { id: 'croc_duel', min: 4, max: 12, create: croc.create, opts: { mode: 'duel' } },
  telepathy: { id: 'telepathy', min: 2, max: 8, create: telepathy.create }
};
